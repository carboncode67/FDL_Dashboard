"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SlideOverForm } from "@/components/slide-over-form";
import { ContactForm } from "@/components/forms/contact-form";

interface AddContactButtonProps {
  farmId: number;
  farmName: string | null;
}

export function AddContactButton({ farmId, farmName }: AddContactButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + New Contact
      </Button>
      <SlideOverForm
        open={open}
        onClose={() => setOpen(false)}
        title={farmName ? `New Contact — ${farmName}` : "New Contact"}
      >
        <ContactForm
          hideFarmSelector
          initialData={{ farms_id: farmId }}
          onSuccess={handleSuccess}
        />
      </SlideOverForm>
    </>
  );
}
