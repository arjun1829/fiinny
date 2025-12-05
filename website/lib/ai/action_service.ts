export type ActionType = 'DESTRUCTIVE' | 'EXTERNAL' | 'SAFE';

export interface ActionConfig {
    type: ActionType;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => Promise<void>;
    onCancel?: () => void;
    isDestructive?: boolean;
}

export interface PendingAction {
    id: string;
    config: ActionConfig;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
}

export const createAction = (
    type: ActionType,
    title: string,
    description: string,
    onConfirm: () => Promise<void>,
    isDestructive: boolean = false
): PendingAction => {
    return {
        id: Math.random().toString(36).substring(7),
        config: {
            type,
            title,
            description,
            confirmLabel: isDestructive ? "Delete" : "Confirm",
            cancelLabel: "Cancel",
            onConfirm,
            isDestructive
        },
        status: 'PENDING'
    };
};
