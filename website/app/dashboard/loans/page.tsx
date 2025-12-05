"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LoanModel } from "@/lib/models/LoanModel";
import { streamLoans } from "@/lib/firestore";
import LoansScreen from "@/components/screens/LoansScreen";

export default function LoansPage() {
    const { user } = useAuth();
    const [loans, setLoans] = useState<LoanModel[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.phoneNumber) return;

        const unsubscribe = streamLoans(user.phoneNumber, (items) => {
            setLoans(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    return <LoansScreen loans={loans} loading={loading} />;
}
