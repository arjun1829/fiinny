// Support Tickets — raised by authenticated business users from the ERP Help
// Center and handled by the platform Super Admin (/super-admin#support). Single
// root-level Firestore collection, deliberately kept separate from payments,
// messages, finance and audit-log data. Identity fields (tenantId, business,
// user) are captured automatically at creation and are never user-editable.

// Root-level Firestore collection holding every support ticket.
export const SUPPORT_TICKETS_COLLECTION = 'supportTickets';

// Ticket lifecycle. New tickets always start as `open`; only the Super Admin
// advances the status.
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

// Business-user selectable priority.
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
    id: string;
    // ── User-supplied content ──
    subject: string;
    category: string;
    description: string;
    priority: TicketPriority;
    // Optional attachment (reuses the tenant-scoped Firebase Storage bucket).
    attachmentUrl?: string;
    attachmentName?: string;
    // ── Auto-captured identity (immutable by the user; enforced in rules) ──
    tenantId: string;
    businessName: string;
    userId: string;      // Firebase Auth uid
    userName: string;
    userEmail: string;
    // ── Admin-managed fields (written only by the Super Admin) ──
    status: TicketStatus;
    adminResponse?: string;
    // Firestore server timestamps — typed `unknown` per the project convention
    // (see JobOpening in types/careers.ts). Read via toDate().
    createdAt?: unknown;
    updatedAt?: unknown;
}

// Categories offered in the create-ticket form.
export const TICKET_CATEGORIES = [
    'Billing & Subscription',
    'Technical Issue / Bug',
    'Feature Request',
    'Account & Access',
    'Data & Reports',
    'Other',
] as const;

export const TICKET_PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
    { value: 'low',    label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high',   label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

export const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
    { value: 'open',        label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved',    label: 'Resolved' },
    { value: 'closed',      label: 'Closed' },
];
