export interface GroupModel {
    id: string;
    name: string;
    memberPhones: string[];
    memberAvatars?: Record<string, string>;
    memberDisplayNames?: Record<string, string>;
    createdBy: string;
    createdAt: Date;
    avatarUrl?: string;
}
