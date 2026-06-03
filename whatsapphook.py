"""
OFEDashBot — WhatsApp Webhook (v12)
==========================================
Receives WhatsApp messages from registered farmers via Twilio and forwards
them to the FDL Dashboard backend API. All data now lives in PostgreSQL via
the FDL backend instead of flat files.

Unknown phone numbers receive absolute silence: no reply, no error, nothing.

Single-slot system: one Twilio number. The farmer phone number identifies the
experiment, linked to a Contact row in the FDL backend.

To run:
    python3 -m uvicorn whatsapphook:app --port 8001

Webhook endpoint:
    /webhook/1   (primary, set this in Twilio)
    /webhook     (alias, same handler)
"""

from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.responses import PlainTextResponse, Response
from contextlib import asynccontextmanager
from typing import Optional
import os
import html
import datetime
import httpx

from config import settings, check_startup_safety, VERSION
import fdl_client

# Shared utilities still used: generate_ticket (for logging/confirmation),
# notify_admin, send_whatsapp, find_farmer, get_experiment_name,
# get_experiment_id, set_onboarding_status, get_onboarding_status.
# Flat-file helpers (log_ticket, log_activity, save_sidecar, etc.) are
# no longer called — storage now goes through fdl_client.
from shared import (
    generate_ticket, send_whatsapp, notify_admin,
    find_farmer, get_experiment_name, get_experiment_id,
    set_onboarding_status, get_onboarding_status,
)


# ---------------------------------------------------------------------------
# Twilio signature validation
# ---------------------------------------------------------------------------

def validate_twilio_signature(request_url: str, params: dict, signature: str) -> bool:
    if not settings.validate_twilio_signature:
        return True
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(settings.twilio_auth_token)
        return validator.validate(request_url, params, signature)
    except ImportError:
        print("[WARN] twilio package not installed — skipping signature validation")
        return True
    except Exception as e:
        print(f"[ERROR] Signature validation error: {e}")
        return False


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

_start_time = datetime.datetime.now()


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_startup_safety()
    print(f"OFEDashBot webhook v{VERSION} starting — environment: {settings.environment}")
    await notify_admin(
        f"Webhook service started. Environment: {settings.environment}."
    )
    yield
    print("OFEDashBot webhook shutting down")
    await notify_admin("Webhook service stopped. Farmers cannot submit until it restarts.")


app = FastAPI(lifespan=lifespan)

# ---------------------------------------------------------------------------
# Extension map and type labels
# ---------------------------------------------------------------------------

EXTENSION_MAP = {
    "image/jpeg":   (".jpg",  "photo"),
    "image/jpg":    (".jpg",  "photo"),
    "image/png":    (".png",  "photo"),
    "image/webp":   (".webp", "photo"),
    "image/heic":   (".heic", "photo"),
    "image/heif":   (".heif", "photo"),
    "image/gif":    (".gif",  "photo"),
    "audio/ogg":    (".ogg",  "recording"),
    "audio/mpeg":   (".mp3",  "recording"),
    "audio/mp4":    (".m4a",  "recording"),
    "audio/amr":    (".amr",  "recording"),
    "audio/wav":    (".wav",  "recording"),
    "audio/x-wav":  (".wav",  "recording"),
    "audio/aac":    (".aac",  "recording"),
    "audio/3gpp":   (".3gp",  "recording"),
    "video/mp4":    (".mp4",  "video"),
    "video/3gpp":   (".3gp",  "video"),
    "video/quicktime": (".mov","video"),
    "video/mpeg":   (".mpeg", "video"),
    "video/webm":   (".webm", "video"),
    "application/pdf": (".pdf", "document"),
    "application/msword": (".doc", "document"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (".docx", "document"),
    "application/vnd.ms-excel": (".xls", "document"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (".xlsx", "document"),
    "application/vnd.ms-powerpoint": (".ppt", "document"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": (".pptx", "document"),
    "text/vcard":   (".vcf",  "contact"),
    "text/x-vcard": (".vcf",  "contact"),
}

# Types that go to the geotag window (hold until location or window expires)
MEDIA_TYPES = ("photo", "recording", "video")

GEOREFERENCE_WINDOW_MINUTES = 5
LOCATION_CAPTION_WINDOW_MINUTES = 5
CONTACT_NOTE_WINDOW_MINUTES = 5

# ---------------------------------------------------------------------------
# Session state (in-memory; Phase 2 will persist to JSON)
# ---------------------------------------------------------------------------

pending_georeference:     dict = {}
pending_location_caption: dict = {}
pending_clarification:    dict = {}
pending_contact_note:     dict = {}

# Media held pending geotag: phone -> list of pending submission dicts
# Each dict: {content_type, file_bytes, filename, caption, ticket, timestamp}
pending_media_hold:       dict = {}


# ---------------------------------------------------------------------------
# Session helpers (unchanged from v11)
# ---------------------------------------------------------------------------

def is_within_window(since: datetime.datetime, minutes: int) -> bool:
    return (datetime.datetime.now() - since).total_seconds() < minutes * 60


def add_to_georeference_window(phone: str, filename: str, ticket: str, slot: str):
    now = datetime.datetime.now()
    if phone in pending_georeference and is_within_window(
        pending_georeference[phone]["since"], GEOREFERENCE_WINDOW_MINUTES
    ):
        pending_georeference[phone]["files"].append(filename)
        pending_georeference[phone]["tickets"].append(ticket)
    else:
        pending_georeference[phone] = {
            "files": [filename], "tickets": [ticket],
            "slot": slot, "since": now
        }


def get_georeference_window(phone: str) -> dict | None:
    if phone in pending_georeference and is_within_window(
        pending_georeference[phone]["since"], GEOREFERENCE_WINDOW_MINUTES
    ):
        return pending_georeference[phone]
    return None


def clear_georeference_window(phone: str):
    pending_georeference.pop(phone, None)
    pending_media_hold.pop(phone, None)


def set_location_caption_window(phone: str, ticket: str):
    pending_location_caption[phone] = {
        "ticket": ticket,
        "since": datetime.datetime.now()
    }


def get_location_caption_window(phone: str) -> dict | None:
    if phone in pending_location_caption and is_within_window(
        pending_location_caption[phone]["since"], LOCATION_CAPTION_WINDOW_MINUTES
    ):
        return pending_location_caption[phone]
    return None


def clear_location_caption_window(phone: str):
    pending_location_caption.pop(phone, None)


def set_contact_note_window(phone: str, ticket: str):
    pending_contact_note[phone] = {
        "ticket": ticket,
        "since": datetime.datetime.now()
    }


def get_contact_note_window(phone: str) -> dict | None:
    if phone in pending_contact_note and is_within_window(
        pending_contact_note[phone]["since"], CONTACT_NOTE_WINDOW_MINUTES
    ):
        return pending_contact_note[phone]
    return None


def clear_contact_note_window(phone: str):
    pending_contact_note.pop(phone, None)


# ---------------------------------------------------------------------------
# vCard parser (unchanged)
# ---------------------------------------------------------------------------

def parse_vcard(raw: str) -> dict:
    contact = {"name": "n/a", "phone": "n/a", "org": "n/a", "email": "n/a"}
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("FN:"):
            contact["name"] = line[3:][:200]
        elif line.startswith("TEL") and ":" in line:
            contact["phone"] = line.split(":")[-1][:20]
        elif line.startswith("ORG:"):
            contact["org"] = line[4:][:200]
        elif line.startswith("EMAIL") and ":" in line:
            contact["email"] = line.split(":")[-1][:200]
    return contact


# ---------------------------------------------------------------------------
# Silent response
# ---------------------------------------------------------------------------

SILENT_RESPONSE = PlainTextResponse(
    content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    media_type="text/xml"
)


# ---------------------------------------------------------------------------
# Core message handler
# ---------------------------------------------------------------------------

async def handle_message(
    slot: str,
    From: str,
    Body: str,
    NumMedia: int,
    MediaUrl0: Optional[str],
    MediaContentType0: Optional[str],
    MessageSid: str,
    SentAt: Optional[str],
    Latitude: Optional[str],
    Longitude: Optional[str],
    Address: Optional[str],
    Label: Optional[str],
) -> PlainTextResponse:

    received_timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    farmer_timestamp   = SentAt or received_timestamp
    phone   = From.replace("whatsapp:", "").replace("+", "").strip()[:15]
    caption = Body.strip()[:2000]

    # --- Allowlist check: resolve phone to FDL token ---
    farmer = find_farmer(phone)
    if not farmer:
        print(f"[SILENT] Unknown phone ignored: {phone}")
        return SILENT_RESPONSE

    # Resolve FDL token for this farmer (used for all API calls below)
    fdl_contact = await fdl_client.fdl_resolve_token(phone)
    if not fdl_contact:
        # Farmer is in farmers.json but not yet in FDL — log and silence
        print(f"[WARN] Farmer {phone} not found in FDL contacts — run migration script")
        return SILENT_RESPONSE
    fdl_token = fdl_contact["token"]

    # --- Onboarding confirmation ---
    onboarding = get_onboarding_status(phone)
    if onboarding.get("status") == "sent":
        set_onboarding_status(phone, "confirmed",
                             f"First message received: {caption[:60] or '[media]'}")
        print(f"[INFO] Onboarding confirmed for {phone}")

    experiment_name = get_experiment_name(farmer, slot)
    experiment_id   = get_experiment_id(farmer)
    ticket          = generate_ticket()

    print(f"Message from {phone} | slot={slot} | exp={experiment_name} | ticket={ticket}")

    # --- Clarification reply ---
    clarif = pending_clarification.get(phone)
    if clarif and not Latitude and not Longitude and NumMedia == 0 and caption:
        if caption.upper() == "YES" and "candidate" in clarif:
            pending_clarification.pop(phone, None)
            return _twiml(f"✅ Got it! Answer recorded for ticket {clarif['ticket']}. Thank you!")
        elif caption.upper() == "NO":
            pending_clarification.pop(phone, None)
            await send_whatsapp(phone,
                f"OK, we will keep waiting for your answer to: {clarif['question']}")
        else:
            pending_clarification[phone]["candidate"] = caption
            return _twiml(
                f"❓ Is this your answer to our question about your recent submission?\n\n"
                f'"{clarif["question"]}"\n\n'
                f"Reply YES to confirm or NO if this is a new observation."
            )

    # --- 1. Location pin ---
    if Latitude and Longitude:
        try:
            lat = float(Latitude)
            lon = float(Longitude)
        except ValueError:
            return _twiml("⚠️ Could not read your location. Please try sharing it again.")

        geo_window = get_georeference_window(phone)

        if geo_window:
            # Flush all held media now that we have coordinates
            held = pending_media_hold.get(phone, [])
            flush_count = 0
            for item in held:
                ext = EXTENSION_MAP.get(item["content_type"], (".bin", "photo"))[0]
                fname = f"{item['ticket']}_{item['timestamp']}_{phone}{ext}"
                if item["fdl_type"] == "photo":
                    await fdl_client.post_photo(
                        fdl_token, item["file_bytes"], fname,
                        latitude=lat, longitude=lon,
                        note=item["caption"], timestamp=item["timestamp"]
                    )
                elif item["fdl_type"] == "recording":
                    await fdl_client.post_recording(
                        fdl_token, item["file_bytes"], fname,
                        start_time=item["timestamp"], gps_track=fdl_client.single_point_track(lat, lon)
                    )
                elif item["fdl_type"] == "video":
                    await fdl_client.post_video(
                        fdl_token, item["file_bytes"], fname,
                        latitude=lat, longitude=lon,
                        note=item["caption"], timestamp=item["timestamp"]
                    )
                flush_count += 1

            clear_georeference_window(phone)

            # Also post the location itself as a standalone FDL location record
            await fdl_client.post_location(
                fdl_token,
                name=f"Location for {flush_count} file(s)",
                track_data=fdl_client.single_point_track(lat, lon),
                start_time=received_timestamp,
            )
            gmaps_url = f"https://www.google.com/maps?q={lat},{lon}"
            return _twiml(
                f"✅ 📍 Location linked to your last {flush_count} file(s).\n"
                f"Ticket: {ticket}\n"
                f"Google Maps: {gmaps_url}"
            )

        else:
            # Standalone location pin
            set_location_caption_window(phone, ticket)
            await fdl_client.post_location(
                fdl_token,
                name=Address or f"Location pin {ticket}",
                track_data=fdl_client.single_point_track(lat, lon),
                start_time=received_timestamp,
            )
            gmaps_url = f"https://www.google.com/maps?q={lat},{lon}"
            return _twiml(
                f"📍 Location recorded. Ticket: {ticket}\n"
                f"Experiment: {experiment_name}\n"
                f"Google Maps: {gmaps_url}\n\n"
                f"📝 Want to add a note? Just reply with your comment."
            )

    # --- 2. Plain text ---
    elif caption and not NumMedia:
        contact_window = get_contact_note_window(phone)
        if contact_window:
            # Note about a previously shared contact
            await fdl_client.post_note(
                fdl_token,
                content=f"[Contact note] {caption}",
                timestamp=received_timestamp,
            )
            clear_contact_note_window(phone)
            return _twiml(
                f"✅ Got it! Note saved for this contact.\n"
                f"Ticket: {contact_window['ticket']}"
            )

        loc_window = get_location_caption_window(phone)
        if loc_window:
            # Caption for a previous location pin
            await fdl_client.post_note(
                fdl_token,
                content=f"[Location note] {caption}",
                timestamp=received_timestamp,
            )
            clear_location_caption_window(phone)
            return _twiml(f"✅ Note added to your location.\nTicket: {loc_window['ticket']}")

        # Plain text observation
        ok = await fdl_client.post_note(
            fdl_token,
            content=caption,
            timestamp=received_timestamp,
        )
        if not ok:
            return _twiml("⚠️ Your message could not be recorded — please try again.")
        return _twiml(
            f"✅ Got it! Your message has been recorded.\n"
            f"Experiment: {experiment_name}\n"
            f"Ticket: {ticket}"
        )

    # --- 3. Media, document, or contact ---
    elif NumMedia > 0 and MediaUrl0:
        content_type = (MediaContentType0 or "application/octet-stream").split(";")[0].strip().lower()

        if content_type not in EXTENSION_MAP:
            return _twiml(
                f"⚠️ Your data was not recorded — file type not supported ({content_type}). "
                f"Supported: photos, voice memos, videos, PDF, MS Office, contacts."
            )

        ext, fdl_type = EXTENSION_MAP[content_type]
        fname = f"{ticket}_{received_timestamp}_{phone}{ext}"

        # Download from Twilio
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(
                    MediaUrl0,
                    auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                    follow_redirects=True,
                )
                response.raise_for_status()
                file_bytes = response.content

            if len(file_bytes) > settings.max_upload_bytes:
                return _twiml(
                    f"⚠️ Your data was not recorded — file is too large "
                    f"({len(file_bytes)/1024/1024:.1f} MB). "
                    f"Maximum size is {settings.max_upload_mb} MB."
                )

        except httpx.HTTPStatusError as e:
            print(f"[ERROR] Failed to download media: {e}")
            return _twiml("⚠️ Your data was not recorded — could not download your file. Please try again.")
        except Exception as e:
            print(f"[ERROR] Media download failed: {e}")
            return _twiml("⚠️ Your data was not recorded — system error. Please try again.")

        # --- Contact card: post immediately (no geotag needed) ---
        if fdl_type == "contact":
            raw_vcard = file_bytes.decode("utf-8", errors="ignore")
            contact = parse_vcard(raw_vcard)
            ok = await fdl_client.post_contact_card(
                fdl_token,
                name=contact["name"],
                phone=contact["phone"],
                email=contact["email"],
                org=contact["org"],
            )
            if not ok:
                return _twiml("⚠️ Contact could not be saved. Please try again.")
            set_contact_note_window(phone, ticket)
            return _twiml(
                f"👤 Contact saved.\n"
                f"Name: {contact['name']}\n"
                f"Ticket: {ticket}\n\n"
                f"📝 Who is this person and should they have access to your "
                f"data repository? Reply with a description."
            )

        # --- Document: post immediately (no geotag needed) ---
        if fdl_type == "document":
            ok = await fdl_client.post_document(
                fdl_token, file_bytes, fname,
                note=caption, timestamp=received_timestamp
            )
            if not ok:
                return _twiml("⚠️ Document could not be saved. Please try again.")
            return _twiml(
                f"✅ Your document has been saved.\n"
                f"Experiment: {experiment_name}\n"
                f"Ticket: {ticket}"
            )

        # --- Photo, recording, video: HOLD until location window closes ---
        # Add to the georeference window AND buffer the bytes.
        # When the location pin arrives (or the window expires and the next
        # message is not a pin), the held media is flushed with coordinates.
        add_to_georeference_window(phone, fname, ticket, slot)
        geo_window = get_georeference_window(phone)

        if phone not in pending_media_hold:
            pending_media_hold[phone] = []
        pending_media_hold[phone].append({
            "file_bytes":   file_bytes,
            "content_type": content_type,
            "fdl_type":     fdl_type,
            "caption":      caption,
            "ticket":       ticket,
            "timestamp":    received_timestamp,
        })

        file_count = len(geo_window["files"])
        already_located = geo_window.get("located", False)

        if already_located:
            # Location already received in this window — flush immediately
            lat_val = geo_window.get("lat")
            lon_val = geo_window.get("lon")
            held = pending_media_hold.get(phone, [])
            for item in held:
                item_ext = EXTENSION_MAP.get(item["content_type"], (".bin", "photo"))[0]
                item_fname = f"{item['ticket']}_{item['timestamp']}_{phone}{item_ext}"
                if item["fdl_type"] == "photo":
                    await fdl_client.post_photo(fdl_token, item["file_bytes"], item_fname,
                                                latitude=lat_val, longitude=lon_val,
                                                note=item["caption"], timestamp=item["timestamp"])
                elif item["fdl_type"] == "recording":
                    await fdl_client.post_recording(fdl_token, item["file_bytes"], item_fname,
                                                    start_time=item["timestamp"],
                                                    gps_track=fdl_client.single_point_track(lat_val, lon_val) if lat_val else None)
                elif item["fdl_type"] == "video":
                    await fdl_client.post_video(fdl_token, item["file_bytes"], item_fname,
                                                latitude=lat_val, longitude=lon_val,
                                                note=item["caption"], timestamp=item["timestamp"])
            pending_media_hold.pop(phone, None)
            return _twiml(
                f"✅ Your {fdl_type} has been saved and geotagged.\n"
                f"Experiment: {experiment_name}\n"
                f"Ticket: {ticket}"
            )

        elif file_count == 1:
            # First file in window — ask for location
            return _twiml(
                f"✅ Your {fdl_type} has been received.\n"
                f"Experiment: {experiment_name}\n"
                f"Ticket: {ticket}\n\n"
                f"📍 Share your location pin within 5 minutes to geotag this "
                f"observation. It will be saved once the location arrives."
            )
        else:
            # More files added to the same window
            return _twiml(
                f"✅ Your {fdl_type} has been received (file {file_count} in this batch).\n"
                f"Ticket: {ticket}\n"
                f"📍 Still waiting for your location pin."
            )

    else:
        return _twiml(
            "💬 Send a message, 📸 photo, 🎤 voice memo, 🎥 video, 📄 PDF, "
            "Office document, 📍 location, or 👥 contact to record an observation."
        )


def _twiml(message: str) -> PlainTextResponse:
    safe = html.escape(message, quote=True)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>{safe}</Message></Response>"""
    return PlainTextResponse(content=twiml, media_type="text/xml")


# ---------------------------------------------------------------------------
# Send-message endpoint (called by FDL Dashboard WhatsApp admin page)
# ---------------------------------------------------------------------------

@app.post("/send-message")
async def send_message_endpoint(request: Request):
    """
    POST /send-message  { phone: str, message: str }
    Called by the FDL Dashboard WhatsApp admin page to send a custom or
    onboarding message to a farmer. Twilio credentials stay in OFEDashBot.
    """
    body = await request.json()
    phone   = body.get("phone", "").strip()
    message = body.get("message", "").strip()
    if not phone or not message:
        return PlainTextResponse("phone and message required", status_code=400)
    ok = await send_whatsapp(phone, message)
    if ok:
        return {"ok": True}
    return PlainTextResponse("Failed to send message via Twilio", status_code=502)


# ---------------------------------------------------------------------------
# Slot endpoints
# ---------------------------------------------------------------------------

def make_webhook(slot: str):
    async def webhook(
        request: Request,
        From: str = Form(...),
        Body: str = Form(default=""),
        NumMedia: int = Form(default=0),
        MediaUrl0: Optional[str] = Form(default=None),
        MediaContentType0: Optional[str] = Form(default=None),
        MessageSid: str = Form(...),
        SentAt: Optional[str] = Form(default=None),
        Latitude: Optional[str] = Form(default=None),
        Longitude: Optional[str] = Form(default=None),
        Address: Optional[str] = Form(default=None),
        Label: Optional[str] = Form(default=None),
    ):
        if settings.validate_twilio_signature:
            signature = request.headers.get("X-Twilio-Signature", "")
            form_data = await request.form()
            if not validate_twilio_signature(str(request.url), dict(form_data), signature):
                print(f"[WARN] Invalid Twilio signature on slot {slot}")
                raise HTTPException(status_code=403, detail="Invalid signature")

        return await handle_message(
            slot=slot, From=From, Body=Body, NumMedia=NumMedia,
            MediaUrl0=MediaUrl0, MediaContentType0=MediaContentType0,
            MessageSid=MessageSid, SentAt=SentAt,
            Latitude=Latitude, Longitude=Longitude,
            Address=Address, Label=Label,
        )
    return webhook


app.add_api_route("/webhook/1", make_webhook("1"), methods=["POST"])
app.add_api_route("/webhook",   make_webhook("1"), methods=["POST"])


@app.get("/health")
def health():
    uptime = str(datetime.datetime.now() - _start_time).split(".")[0]
    return {
        "status": "ok",
        "service": "OFEDashBot-webhook",
        "version": VERSION,
        "environment": settings.environment,
        "uptime": uptime,
        "signature_validation": settings.validate_twilio_signature,
        "fdl_backend": settings.fdl_api_url,
    }
