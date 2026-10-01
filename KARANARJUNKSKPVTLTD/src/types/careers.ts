// Careers — job openings shown on the public /careers page and managed by the
// platform Super Admin (/super-admin#careers). Single Firestore collection, no
// tenant scoping (this is platform-level content, like the `plans` catalogue).

// Root-level Firestore collection holding every job opening.
export const JOB_OPENINGS_COLLECTION = 'jobOpenings';

// Lifecycle status. Only `published` openings are visible on the public page.
export type JobStatus = 'draft' | 'published' | 'closed';

export interface JobOpening {
    id: string;
    title: string;
    department: string;
    location: string;
    employmentType: string;   // e.g. "Full-time", "Contract", "Internship"
    description: string;
    requirements: string[];   // one bullet per entry
    status: JobStatus;
    // Firestore server timestamps — typed `unknown` per the project convention
    // (see TenantSubscription in utils/subscriptionPlans.ts). Read via toDate().
    createdAt?: unknown;
    updatedAt?: unknown;
}

// Common employment types offered in the editor dropdown.
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'] as const;

export const JOB_STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
    { value: 'draft',     label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'closed',    label: 'Closed' },
];
