import { useState, useEffect } from "react";
import { RecurringExpenseModel } from "@/lib/models/RecurringExpenseModel";
import { RecurringExpenseService } from "@/lib/services/RecurringExpenseService";
import { Loader2, CalendarClock, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface RecurringExpensesTabProps {
    currentUserId: string;
    filterType: 'group' | 'friend';
    filterId: string;
}

export default function RecurringExpensesTab({ currentUserId, filterType, filterId }: RecurringExpensesTabProps) {
    const [expenses, setExpenses] = useState<RecurringExpenseModel[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = RecurringExpenseService.streamRecurringExpenses(
            currentUserId,
            { type: filterType, id: filterId },
            (items) => {
                setExpenses(items);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [currentUserId, filterType, filterId]);

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to stop this recurring expense?")) {
            await RecurringExpenseService.deleteRecurringExpense(currentUserId, id);
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-teal-600" /></div>;

    if (expenses.length === 0) {
        return (
            <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CalendarClock className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">No recurring expenses</h3>
                <p className="text-slate-500 max-w-sm mx-auto">
                    Recurring expenses will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-slate-100">
            {expenses.map((expense) => (
                <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                            <CalendarClock className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-bold text-slate-900">{expense.description}</div>
                            <div className="text-xs text-slate-500 capitalize">{expense.frequency} • Next: {format(expense.nextDueDate.toDate(), 'MMM d, yyyy')}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="font-bold text-slate-900">
                            ₹{expense.amount.toFixed(2)}
                        </div>
                        <button
                            onClick={() => handleDelete(expense.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
