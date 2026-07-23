// Invoice Template Types

export type InvoiceTemplateType = 'distributor_retailer' | 'retailer_customer';

export interface InvoiceField {
    id: string;           // unique id
    label: string;        // display label on invoice
    sourceKey: string;    // key to look up in data object (order/retailer)
    show: boolean;        // whether this field appears on invoice
    bold: boolean;        // render label/value bold
    order: number;
    isCurrency?: boolean; // format as ₹ amount
    systemOnly?: boolean; // cannot be deleted
}

export interface InvoiceTemplateBranding {
    businessName: string;
    address: string;
    gstin?: string;
    licenseNumbers?: string;
    logoUrl?: string;
    bankDetails?: string;
    signatureName?: string;
    signatureUrl?: string;    // optional uploaded signature image (printed above the name)
    terms?: string;
    contact?: string;
    email?: string;
    upiId?: string;           // UPI VPA for QR code (e.g. "yourname@paytm")
    razorpayKeyId?: string;   // Razorpay public key for payment links
    // thermal header customisation
    thermalHeader?: string;   // defaults to businessName
    thermalFooter?: string;   // defaults to "Thank You!"
}

export interface InvoiceTemplate {
    templateId: InvoiceTemplateType;
    name: string;
    description: string;
    fields: InvoiceField[];
    updatedAt?: any;
}
