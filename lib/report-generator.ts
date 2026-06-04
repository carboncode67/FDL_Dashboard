import { prisma } from "@/lib/prisma";

export interface FarmerReportData {
  id: number;
  name: string;
  phone: string;
  farm_name: string | null;
  total: number;
  type_totals: Record<string, number>;
  by_day_type: Record<string, Record<string, number>>;
  days_since: number | null;
  last_ts: Date | null;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  photo:      { label: "Photo",      color: "#378ADD" },
  recording:  { label: "Voice memo", color: "#1D9E75" },
  video:      { label: "Video",      color: "#7F77DD" },
  note:       { label: "Text",       color: "#EF9F27" },
  location:   { label: "Location",   color: "#5DCAA5" },
  document:   { label: "Document",   color: "#D85A30" },
  contact_card: { label: "Contact",  color: "#639922" },
};

const TYPE_ORDER = ["photo","recording","video","note","location","document","contact_card"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getDates(days: number) {
  const today = new Date(); today.setHours(0,0,0,0);
  return Array.from({length: days}, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return d;
  });
}

function fmtKey(d: Date) {
  return d.toISOString().slice(0,10).replace(/-/g,"");
}

export async function buildReportData(contactIds: number[], days = 14): Promise<FarmerReportData[]> {
  const dates = getDates(days);
  const dateKeys = dates.map(fmtKey);
  const cutoff = new Date(Date.now() - days * 86400000);

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    include: {
      Farm: { select: { Farm_Name: true } },
      Photos:    { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      Recordings:{ where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      Videos:    { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      Notes:     { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      Locations: { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      Documents: { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
      ContactCards: { where: { received_at: { gte: cutoff } }, select: { received_at: true } },
    },
  });

  return contacts.map(c => {
    const byDayType: Record<string, Record<string, number>> = {};
    dateKeys.forEach(k => {
      byDayType[k] = {};
      TYPE_ORDER.forEach(t => byDayType[k][t] = 0);
    });

    const typeTotals: Record<string, number> = {};
    TYPE_ORDER.forEach(t => typeTotals[t] = 0);

    const typeMap: Record<string, Date[]> = {
      photo:        c.Photos.map(x => x.received_at),
      recording:    c.Recordings.map(x => x.received_at),
      video:        c.Videos.map(x => x.received_at),
      note:         c.Notes.map(x => x.received_at),
      location:     c.Locations.map(x => x.received_at),
      document:     c.Documents.map(x => x.received_at),
      contact_card: c.ContactCards.map(x => x.received_at),
    };

    let lastTs: Date | null = null;
    for (const [type, dates_arr] of Object.entries(typeMap)) {
      for (const d of dates_arr) {
        const key = fmtKey(d);
        if (byDayType[key]) byDayType[key][type]++;
        typeTotals[type]++;
        if (!lastTs || d > lastTs) lastTs = d;
      }
    }

    const total = Object.values(typeTotals).reduce((s,v) => s+v, 0);
    const daysSince = lastTs ? Math.floor((Date.now() - lastTs.getTime()) / 86400000) : null;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? "",
      farm_name: c.Farm?.Farm_Name ?? null,
      total,
      type_totals: typeTotals,
      by_day_type: byDayType,
      days_since: daysSince,
      last_ts: lastTs,
    };
  });
}

function abbreviateName(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length-1][0]}.`;
  return name;
}

export function generateReportHtml(farmers: FarmerReportData[], days = 14): string {
  const dates = getDates(days);
  const dateKeys = dates.map(fmtKey);
  const weekendIdx = dates.map((d,i) => (d.getDay()===0||d.getDay()===6) ? i : -1).filter(i=>i>=0);
  let weekBoundary = 7;
  for (let i = 1; i < days; i++) { if (dates[i].getDay()===0) { weekBoundary = i; break; } }

  const totalSubmissions = farmers.reduce((s,f) => s+f.total, 0);
  const activeFarmers    = farmers.filter(f => f.total > 0).length;

  const s = dates[0], e = dates[dates.length-1];
  const period = `${MONTHS[s.getMonth()]} ${s.getDate()} to ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  const generated = new Date().toLocaleString();

  const cards = farmers.map(f => {
    const name = abbreviateName(f.name);
    const exp = f.farm_name ? `<div class="farmer-exp">${f.farm_name}</div>` : "";

    let lastSubHtml = "";
    if (!f.last_ts) {
      lastSubHtml = `<span class="last-sub-date last-sub-never">No submissions</span>`;
    } else {
      const dateStr = `${MONTHS[f.last_ts.getMonth()]} ${f.last_ts.getDate()}`;
      const cls = f.days_since===0 ? "last-sub-today"
        : (f.days_since??99)<=3 ? "last-sub-recent"
        : (f.days_since??99)<=6 ? "last-sub-mid"
        : "last-sub-old";
      lastSubHtml = `<span class="last-sub-prefix">Last submission </span><span class="last-sub-date ${cls}">${dateStr}</span>`;
    }

    const pills = TYPE_ORDER
      .filter(t => f.type_totals[t] > 0)
      .map(t => `<span class="pill" style="background:${TYPE_CONFIG[t].color}">${f.type_totals[t]} ${TYPE_CONFIG[t].label}</span>`)
      .join("");

    const legend = TYPE_ORDER
      .filter(t => f.type_totals[t] > 0)
      .map(t => `<span class="legend-item"><span class="legend-swatch" style="background:${TYPE_CONFIG[t].color}"></span>${TYPE_CONFIG[t].label} (${f.type_totals[t]})</span>`)
      .join("");

    const datasets = TYPE_ORDER
      .filter(t => dateKeys.some(k => f.by_day_type[k][t] > 0))
      .map(t => JSON.stringify({
        label: TYPE_CONFIG[t].label,
        data: dateKeys.map(k => f.by_day_type[k][t]),
        backgroundColor: TYPE_CONFIG[t].color,
        borderWidth: 0, stack: "daily"
      }));

    const totalByDay = dateKeys.map(k => TYPE_ORDER.reduce((s,t) => s + f.by_day_type[k][t], 0));

    return `
    <div class="farmer-card">
      <div class="farmer-header">
        <div>
          <div class="farmer-name">${name}</div>
          ${exp}
        </div>
        <div class="farmer-total">
          <div class="last-sub-wrap">${lastSubHtml}</div>
          <div class="total-num">${f.total}</div>
          <div class="total-lbl">submissions</div>
        </div>
      </div>
      <div class="pills">${pills || '<span style="color:#aaa;font-size:12px;">No submissions this period</span>'}</div>
      <div class="legend">${legend}</div>
      <div class="chart-wrap"><canvas id="chart_${f.id}"></canvas></div>
    </div>`;
  }).join("\n");

  const chartScripts = farmers.map(f => {
    const datasets = TYPE_ORDER
      .filter(t => dateKeys.some(k => f.by_day_type[k][t] > 0))
      .map(t => JSON.stringify({
        label: TYPE_CONFIG[t].label,
        data: dateKeys.map(k => f.by_day_type[k][t]),
        backgroundColor: TYPE_CONFIG[t].color,
        borderWidth: 0, stack: "daily"
      }));
    const totalByDay = dateKeys.map(k => TYPE_ORDER.reduce((s,t) => s + f.by_day_type[k][t], 0));
    return `
    (function() {
      var ctx = document.getElementById('chart_${f.id}');
      if (!ctx) return;
      var totalByDay = ${JSON.stringify(totalByDay)};
      new Chart(ctx, {
        type: 'bar',
        data: { labels: DATE_LABELS, datasets: [${datasets.join(",")}] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              title: function(items) { var d=DATES[items[0].dataIndex]; return DAYS_SHORT[d[0]]+' '+MONTHS[d[1]]+' '+d[2]; },
              afterBody: function(items) { return 'Day total: '+totalByDay[items[0].dataIndex]; }
            }}
          },
          scales: {
            x: { stacked:true, grid:{display:false}, ticks:{font:{size:11},maxRotation:0,autoSkip:false} },
            y: { stacked:true, beginAtZero:true, max:10, ticks:{stepSize:2,font:{size:10}}, grid:{color:'rgba(128,128,128,0.1)'} }
          }
        },
        plugins: [weekendPlugin, weekSeparatorPlugin]
      });
    })();`;
  }).join("\n");

  const dateLabelsJs = JSON.stringify(dates.map(d => [DAYS_SHORT[d.getDay()], d.getDate()]));
  const datesJs = JSON.stringify(dates.map(d => [d.getDay(), MONTHS[d.getMonth()], d.getDate()]));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Farmers Datalab — Activity Report — ${period}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f0ee; color: #1a1a1a; padding: 24px; }
.container { max-width: 900px; margin: 0 auto; }
.report-header { padding: 20px 0 12px; border-bottom: 1px solid #ddd; margin-bottom: 16px; }
.report-header h1 { font-size: 20px; font-weight: 600; margin-bottom: 3px; }
.report-header p { font-size: 13px; color: #666; }
.metric-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
.metric { background: white; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px 14px; }
.metric .val { font-size: 24px; font-weight: 500; }
.metric .lbl { font-size: 12px; color: #888; margin-top: 2px; }
.farmer-card { background: white; border: 1px solid #e8e8e8; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
.farmer-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.farmer-name { font-size: 15px; font-weight: 600; }
.farmer-exp { font-size: 12px; color: #666; margin-top: 2px; }
.farmer-total { text-align: right; }
.total-num { font-size: 28px; font-weight: 500; color: #185FA5; }
.total-lbl { font-size: 10px; color: #aaa; }
.last-sub-wrap { margin-bottom: 4px; text-align: right; }
.last-sub-prefix { font-size: 11px; color: #1a1a1a; }
.last-sub-date { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; display: inline-block; }
.last-sub-today, .last-sub-recent { background: #EAF3DE; color: #3B6D11; }
.last-sub-mid { background: #FAEEDA; color: #854F0B; }
.last-sub-old, .last-sub-never { background: #FCEBEB; color: #A32D2D; }
.pills { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; color: white; font-weight: 500; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; font-size: 11px; color: #666; }
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.chart-wrap { position: relative; width: 100%; height: 150px; }
.footer { font-size: 11px; color: #aaa; text-align: center; padding-top: 12px; border-top: 1px solid #e8e8e8; margin-top: 8px; }
</style>
</head>
<body>
<div class="container">
  <div class="report-header">
    <h1>Farmers Datalab — Activity Report</h1>
    <p>${period} &nbsp;·&nbsp; Generated ${generated}</p>
  </div>
  <div class="metric-row">
    <div class="metric"><div class="val">${activeFarmers}</div><div class="lbl">Active farmers</div></div>
    <div class="metric"><div class="val">${farmers.length}</div><div class="lbl">Farmers in report</div></div>
    <div class="metric"><div class="val">${totalSubmissions}</div><div class="lbl">Total submissions</div></div>
    <div class="metric"><div class="val">${days}</div><div class="lbl">Day window</div></div>
  </div>
  ${cards}
  <div class="footer">Farmers Datalab / ScienceVersa &nbsp;·&nbsp; farmersdatalab@gmail.com</div>
</div>
<script>
var MONTHS=${JSON.stringify(MONTHS)};
var DAYS_SHORT=${JSON.stringify(DAYS_SHORT)};
var DATE_LABELS=${dateLabelsJs};
var DATES=${datesJs};
var WEEKEND_IDX=${JSON.stringify(weekendIdx)};
var WEEK_BOUNDARY=${weekBoundary};
var N_DAYS=${days};
var weekendPlugin={id:'weekendShading',beforeDraw:function(chart){var c=chart.ctx,ca=chart.chartArea,x=chart.scales.x;WEEKEND_IDX.forEach(function(i){var bw=x.width/N_DAYS,cx=x.getPixelForValue(i);c.save();c.fillStyle='rgba(128,128,128,0.1)';c.fillRect(cx-bw/2,ca.top,bw,ca.bottom-ca.top);c.restore();})}};
var weekSeparatorPlugin={id:'weekSeparator',afterDraw:function(chart){if(WEEK_BOUNDARY>=N_DAYS)return;var c=chart.ctx,ca=chart.chartArea,x=chart.scales.x,cx=x.getPixelForValue(WEEK_BOUNDARY-0.5);c.save();c.strokeStyle='rgba(100,100,100,0.5)';c.lineWidth=1.5;c.setLineDash([4,3]);c.beginPath();c.moveTo(cx,ca.top);c.lineTo(cx,ca.bottom);c.stroke();c.restore();}};
${chartScripts}
</script>
</body>
</html>`;
}

/**
 * generateEmailHtml
 *
 * Like generateReportHtml but replaces each Chart.js canvas with a
 * PNG screenshot captured by Puppeteer. This makes charts visible in
 * email clients that block JavaScript.
 *
 * Steps:
 *  1. Render the full interactive HTML report in a headless browser
 *  2. Wait for Chart.js to finish drawing
 *  3. Screenshot each chart canvas as a PNG
 *  4. Replace the <canvas> elements with <img> tags in the final HTML
 */
export async function generateEmailHtml(
  farmers: FarmerReportData[],
  days = 14,
  baseUrl = "http://localhost:3000"
): Promise<string> {
  // Dynamic import so Puppeteer is only loaded when sending emails,
  // not on every page load.
  const puppeteer = await import("puppeteer");
  const browser   = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 600 });

    // Load the interactive report HTML
    const html = generateReportHtml(farmers, days);
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for Chart.js to finish rendering all charts
    await page.waitForFunction(
      () => {
        const canvases = document.querySelectorAll("canvas");
        return canvases.length > 0 &&
          Array.from(canvases).every(c => c.width > 0 && c.height > 0);
      },
      { timeout: 10000 }
    );

    // Give charts an extra moment to finish drawing
    await new Promise(r => setTimeout(r, 500));

    // Capture each chart canvas as a base64 PNG
    const chartImages: Record<string, string> = {};
    for (const farmer of farmers) {
      const canvasId = `chart_${farmer.id}`;
      const dataUrl  = await page.evaluate((id: string) => {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        return canvas ? canvas.toDataURL("image/png") : null;
      }, canvasId);
      if (dataUrl) chartImages[canvasId] = dataUrl;
    }

    // Replace each <canvas> with an <img> in the HTML
    let emailHtml = html;
    for (const [canvasId, dataUrl] of Object.entries(chartImages)) {
      // Replace the chart-wrap div content
      const canvasPattern = new RegExp(
        `<div class="chart-wrap"><canvas id="${canvasId}"[^>]*></canvas></div>`,
        "g"
      );
      emailHtml = emailHtml.replace(
        canvasPattern,
        `<div class="chart-wrap" style="height:150px">` +
        `<img src="${dataUrl}" style="width:100%;height:150px;object-fit:fill" ` +
        `alt="Submission chart for farmer ${canvasId}" /></div>`
      );
    }

    // Remove the Chart.js script block — not needed in email
    emailHtml = emailHtml.replace(
      /<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>/g, ""
    );
    emailHtml = emailHtml.replace(/<script[\s\S]*?<\/script>/g, "");

    return emailHtml;
  } finally {
    await browser.close();
  }
}
