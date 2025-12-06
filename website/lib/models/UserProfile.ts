export interface UserProfile {
    phoneNumber: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
    createdAt?: Date;
    // Partner Sharing
    partnerId?: string;
    partnerStatus?: 'pending' | 'connected';
    partnerName?: string;
    currency?: string;
}
