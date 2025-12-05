import { db } from "./firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    onSnapshot,
    DocumentSnapshot
} from "firebase/firestore";

// --- Models (Imported) ---
import { ExpenseItem, expenseConverter, AttachmentMeta } from "./models/ExpenseItem";
import { IncomeItem, incomeConverter } from "./models/IncomeItem";
import { FriendModel } from "./models/FriendModel";
import { GroupModel } from "./models/GroupModel";
import { UserProfile } from "./models/UserProfile";
import { GoalModel, goalConverter, GoalStatus, GoalType } from "./models/GoalModel";
import { LoanModel, loanConverter, LoanInterestMethod, LoanShareMode } from "./models/LoanModel";
import { AssetModel, assetConverter } from "./models/AssetModel";

// Re-export for backward compatibility
export type { ExpenseItem, IncomeItem, FriendModel, GroupModel, UserProfile, AttachmentMeta };
export type { GoalModel, LoanModel, AssetModel };
export { expenseConverter, incomeConverter, goalConverter, loanConverter, assetConverter };
export type { GoalStatus, GoalType, LoanInterestMethod, LoanShareMode };

// --- Services (Re-exported) ---
import { AuthService } from "./services/AuthService";
import { ExpenseService } from "./services/ExpenseService";
import { IncomeService } from "./services/IncomeService";
import { FriendService } from "./services/FriendService";
import { GroupService } from "./services/GroupService";
import { GoalService } from "./services/GoalService";
import { LoanService } from "./services/LoanService";
import { AssetService } from "./services/AssetService";

export const getUserProfile = AuthService.getUserProfile;
export const createUserProfile = AuthService.createUserProfile;

export const getExpenses = ExpenseService.getExpenses;
export const streamExpenses = ExpenseService.streamExpenses;
export const deleteExpense = ExpenseService.deleteExpense;
export const addExpense = ExpenseService.addExpense;
export const getExpensesByFriend = ExpenseService.getExpensesByFriend;
export const getExpensesByGroup = ExpenseService.getExpensesByGroup;

export const getIncomes = IncomeService.getIncomes;
export const streamIncomes = IncomeService.streamIncomes;
export const deleteIncome = IncomeService.deleteIncome;
export const addIncome = IncomeService.addIncome;

export const getFriends = FriendService.getFriends;
export const streamFriends = FriendService.streamFriends;
export const addFriend = FriendService.addFriend;

export const getGroups = GroupService.getGroups;
export const streamGroups = GroupService.streamGroups;
export const createGroup = GroupService.createGroup;

export const getGoals = GoalService.getGoals;
export const streamGoals = GoalService.streamGoals;
export const addGoal = GoalService.addGoal;
export const deleteGoal = GoalService.deleteGoal;

export const getLoans = LoanService.getLoans;
export const streamLoans = LoanService.streamLoans;
export const addLoan = LoanService.addLoan;
export const deleteLoan = LoanService.deleteLoan;

export const getAssets = AssetService.getAssets;
export const streamAssets = AssetService.streamAssets;

// Legacy exports for backward compatibility if needed (though we're replacing them)
export {
    AuthService,
    ExpenseService,
    IncomeService,
    FriendService,
    GroupService,
    GoalService,
    LoanService,
    AssetService
};

