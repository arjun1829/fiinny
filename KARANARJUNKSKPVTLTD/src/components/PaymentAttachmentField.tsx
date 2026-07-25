import { useState, useEffect, useRef } from 'react';
import { Paperclip, FileText, X } from 'lucide-react';

export interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
}

interface Props {
  pendingFile: File | null;
  existingAttachment?: AttachmentMeta | null;
  /** True when the user explicitly removed an existing attachment */
  attachmentCleared: boolean;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}

const ACCEPT = '.jpg,.jpeg,.png,.pdf';

export default function PaymentAttachmentField({
  pendingFile, existingAttachment, attachmentCleared, onFileSelect, onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pendingFile?.type.startsWith('image/')) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => { URL.revokeObjectURL(url); };
    }
    setPreviewUrl(null);
  }, [pendingFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  };

  const showZone = !pendingFile && (!existingAttachment || attachmentCleared);
  const showPending = !!pendingFile;
  const showExisting = !pendingFile && !!existingAttachment && !attachmentCleared;

  const isImage = (type?: string) => !!type?.startsWith('image/');

  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: '0.5rem', padding: '0.4rem 0.7rem',
    borderTop: '1px solid var(--surface-border)', background: 'var(--surface-base)',
  };
  const chipBtn = (danger?: boolean): React.CSSProperties => ({
    fontSize: '0.73rem', padding: '0.2rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
    border: `1px solid ${danger ? 'hsla(0,84%,60%,0.35)' : 'var(--surface-border)'}`,
    background: 'transparent', color: danger ? 'var(--danger)' : 'var(--text-secondary)',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.25rem',
  });

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
        Payment Proof{' '}
        <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional · JPG, PNG or PDF)</span>
      </label>

      <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleChange} style={{ display: 'none' }} />

      {showZone && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', padding: '0.75rem', borderRadius: '10px',
            border: '1.5px dashed var(--surface-border)',
            background: 'var(--surface-raised)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            color: 'var(--text-tertiary)', fontSize: '0.82rem', fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary-light)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--surface-border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          <Paperclip size={14} /> Attach proof
        </button>
      )}

      {showPending && pendingFile && (
        <div style={{ borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden' }}>
          {previewUrl
            ? <img src={previewUrl} alt="Proof preview" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', display: 'block', background: 'var(--surface-base)' }} />
            : (
              <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="var(--primary-light)" />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
              </div>
            )}
          <div style={rowStyle}>
            <button type="button" style={chipBtn()} onClick={() => inputRef.current?.click()}>Change</button>
            <button type="button" style={chipBtn(true)} onClick={onClear}><X size={10} /> Remove</button>
          </div>
        </div>
      )}

      {showExisting && existingAttachment && (
        <div style={{ borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden' }}>
          {isImage(existingAttachment.type)
            ? (
              <a href={existingAttachment.url} target="_blank" rel="noopener noreferrer">
                <img src={existingAttachment.url} alt="Proof" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', display: 'block', background: 'var(--surface-base)' }} />
              </a>
            )
            : (
              <a href={existingAttachment.url} target="_blank" rel="noopener noreferrer" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                <FileText size={18} color="var(--primary-light)" />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {existingAttachment.name}
                </span>
              </a>
            )}
          <div style={rowStyle}>
            <button type="button" style={chipBtn()} onClick={() => inputRef.current?.click()}>Replace</button>
            <button type="button" style={chipBtn(true)} onClick={onClear}><X size={10} /> Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
