"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { GoalModel } from "@/lib/models/GoalModel";
import { streamGoals } from "@/lib/firestore";
import GoalsScreen from "@/components/screens/GoalsScreen";

export default function GoalsPage() {
    const { user } = useAuth();
    const [goals, setGoals] = useState<GoalModel[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.phoneNumber) return;

        const unsubscribe = streamGoals(user.phoneNumber, (items) => {
            setGoals(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    return <GoalsScreen goals={goals} loading={loading} />;
}
