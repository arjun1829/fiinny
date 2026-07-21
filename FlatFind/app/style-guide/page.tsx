'use client';

import { useState } from 'react';
import { Button, Pill, Badge, Modal, ModalCloseButton, useToast, Input, Textarea, FieldLabel, Select } from '@/components/ui';

// Phase 2 validation scaffold — renders every ui/ primitive side by side for
// visual comparison against the original SPA (index (1).html). Not part of
// the shipped app; superseded once real pages are built in later phases.
export default function StyleGuidePage() {
  const [pillActive, setPillActive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-extrabold tracking-tight text-ink">Style Guide</h1>
      <p className="mb-10 text-muted">Phase 2 — design tokens &amp; shared UI primitives, for visual diff only.</p>

      <Section title="Colors">
        <div className="flex flex-wrap gap-4">
          <Swatch className="bg-brand" label="brand" />
          <Swatch className="bg-brand-2" label="brand-2" />
          <Swatch className="bg-brand-light" label="brand-light" textDark />
          <Swatch className="bg-accent" label="accent" />
          <Swatch className="bg-accent-light" label="accent-light" textDark />
          <Swatch className="bg-city-blr" label="city-blr" />
          <Swatch className="bg-city-hyd" label="city-hyd" />
          <Swatch className="bg-city-gur" label="city-gur" />
        </div>
      </Section>

      <Section title="Typography">
        <p className="font-display text-4xl font-extrabold text-ink">Fraunces display 900</p>
        <p className="mt-2 font-sans text-base text-ink-2">Outfit body text — the default sans throughout the app.</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="brand">Brand</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="warn">Warn</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="pro">✓ Pro</Button>
          <Button variant="brand" size="sm">Small</Button>
          <Button variant="brand" size="xs">XS</Button>
        </div>
      </Section>

      <Section title="Pills">
        <div className="flex flex-wrap gap-2">
          <Pill active={pillActive} onClick={() => setPillActive((v) => !v)}>
            Toggle me
          </Pill>
          <Pill>Bangalore</Pill>
          <Pill active>Hyderabad</Pill>
          <Pill>Gurgaon</Pill>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge variant="new">NEW</Badge>
          <Badge variant="hot">🔥 Hot</Badge>
          <Badge variant="viewed">Viewed</Badge>
          <Badge variant="owner">OWNER</Badge>
          <Badge variant="broker">BROKER</Badge>
          <Badge variant="flatmate">FLATMATE</Badge>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-md gap-4">
          <div>
            <FieldLabel>Title</FieldLabel>
            <Input placeholder="e.g. 2BHK in Koramangala" />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <Textarea placeholder="Describe the flat…" />
          </div>
          <div>
            <FieldLabel>City</FieldLabel>
            <Select defaultValue="Bangalore">
              <option>Bangalore</option>
              <option>Hyderabad</option>
              <option>Gurgaon</option>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Toast">
        <Button variant="brand" onClick={() => toast('✅ Your listing has been posted!')}>
          Trigger success toast
        </Button>
        <Button variant="outline" className="ml-3" onClick={() => toast('Something went wrong.', 'error')}>
          Trigger error toast
        </Button>
      </Section>

      <Section title="Modal">
        <Button variant="brand" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidthClassName="max-w-[420px]">
          <div className="p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold">Sample Modal</h2>
              <ModalCloseButton onClick={() => setModalOpen(false)} />
            </div>
            <p className="text-sm text-ink-2">
              Backdrop blur, fade/slide-up entrance, click-outside and Escape to close, body scroll lock — all ported
              from the original .overlay / .mbox pattern.
            </p>
          </div>
        </Modal>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 className="mb-4 font-display text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ className, label, textDark }: { className: string; label: string; textDark?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`h-14 w-24 rounded-r border border-border ${className}`} />
      <span className={`text-xs font-semibold ${textDark ? 'text-ink-2' : 'text-muted'}`}>{label}</span>
    </div>
  );
}
