import { ExpenseItem, IncomeItem } from "@/lib/firestore";

export interface SankeyNode {
    id: string;
    nodeColor?: string;
}

export interface SankeyLink {
    source: string;
    target: string;
    value: number;
}

export interface SankeyData {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

const CATEGORY_MAP: Record<string, 'Needs' | 'Wants' | 'Savings'> = {
    // Needs
    'rent': 'Needs',
    'emi': 'Needs',
    'groceries': 'Needs',
    'utilities': 'Needs',
    'bills': 'Needs',
    'education': 'Needs',
    'health': 'Needs',
    'fuel': 'Needs',
    'transport': 'Needs',
    'medical': 'Needs',
    'home': 'Needs',

    // Savings / Investments
    'investment': 'Savings',
    'investments': 'Savings',
    'sip': 'Savings',
    'mutual fund': 'Savings',
    'gold': 'Savings',
    'stocks': 'Savings',
    'savings': 'Savings',
    'insurance': 'Savings', // debatable, but usually good financial health

    // Wants (Default)
    'food': 'Wants',
    'restaurants': 'Wants',
    'dining': 'Wants',
    'shopping': 'Wants',
    'entertainment': 'Wants',
    'travel': 'Wants',
    'subscriptions': 'Wants',
    'gifts': 'Wants',
    'movies': 'Wants',
    'games': 'Wants'
};

export const generateSankeyData = (incomes: IncomeItem[], expenses: ExpenseItem[]): SankeyData => {
    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];
    const nodeIds = new Set<string>();

    const addNode = (id: string, color?: string) => {
        if (!nodeIds.has(id)) {
            nodes.push({ id, nodeColor: color });
            nodeIds.add(id);
        }
    };

    // 1. Process Income
    // Group by Category (e.g. Salary, Freelance)
    const incomeMap = new Map<string, number>();
    let totalIncome = 0;

    incomes.forEach(inc => {
        const cat = inc.category || "Other Income";
        const amt = inc.amount;
        incomeMap.set(cat, (incomeMap.get(cat) || 0) + amt);
        totalIncome += amt;
    });

    // Add Income Nodes and Link to "Wallet"
    const WALLET_NODE = "Wallet";
    addNode(WALLET_NODE, "#64748b"); // Slate

    incomeMap.forEach((amt, src) => {
        addNode(src, "#10b981"); // Emerald
        links.push({ source: src, target: WALLET_NODE, value: amt });
    });

    // 2. Process Expenses
    // We flow Wallet -> Bucket (Needs/Wants/Savings) -> Category
    const expenseBuckets = {
        'Needs': 0,
        'Wants': 0,
        'Savings': 0
    };

    // We also need detailed links from Bucket -> Category
    const bucketToCatLinks: { bucket: string, cat: string, val: number }[] = [];
    const catTotalMap = new Map<string, number>();

    expenses.forEach(exp => {
        const cat = exp.category || "Uncategorized";
        const lowerCat = cat.toLowerCase();
        let bucket: 'Needs' | 'Wants' | 'Savings' = 'Wants'; // Default

        // Heuristic Check
        if (CATEGORY_MAP[lowerCat]) {
            bucket = CATEGORY_MAP[lowerCat];
        } else {
            // Basic keyword matching if direct map fails
            if (lowerCat.includes('bill') || lowerCat.includes('rent') || lowerCat.includes('grocery')) bucket = 'Needs';
            else if (lowerCat.includes('invest') || lowerCat.includes('save') || lowerCat.includes('fund')) bucket = 'Savings';
        }

        expenseBuckets[bucket] += exp.amount;
        catTotalMap.set(cat, (catTotalMap.get(cat) || 0) + exp.amount);

        // Accumulate link usage later to avoid duplicates link entries (Sankey prefers aggregated links)
    });

    // Create Bucket Nodes
    addNode("Needs", "#3b82f6"); // Blue
    addNode("Wants", "#f43f5e"); // Rose
    addNode("Savings", "#f59e0b"); // Amber

    // Link Wallet -> Buckets
    if (expenseBuckets.Needs > 0) links.push({ source: WALLET_NODE, target: "Needs", value: expenseBuckets.Needs });
    if (expenseBuckets.Wants > 0) links.push({ source: WALLET_NODE, target: "Wants", value: expenseBuckets.Wants });
    if (expenseBuckets.Savings > 0) links.push({ source: WALLET_NODE, target: "Savings", value: expenseBuckets.Savings });

    // Link Buckets -> Categories
    // We need to re-iterate or use the map. Let's just iterate categories and assign them to buckets again (stateless) or better:
    // aggregate grouped by bucket+cat
    const bucketCatAgg = new Map<string, number>(); // Key: "Bucket|Category"

    expenses.forEach(exp => {
        const cat = exp.category || "Uncategorized";
        const lowerCat = cat.toLowerCase();
        let bucket: 'Needs' | 'Wants' | 'Savings' = 'Wants';
        if (CATEGORY_MAP[lowerCat]) bucket = CATEGORY_MAP[lowerCat];
        else {
            if (lowerCat.includes('bill') || lowerCat.includes('rent') || lowerCat.includes('grocery')) bucket = 'Needs';
            else if (lowerCat.includes('invest') || lowerCat.includes('save') || lowerCat.includes('fund')) bucket = 'Savings';
        }

        const key = `${bucket}|${cat}`;
        bucketCatAgg.set(key, (bucketCatAgg.get(key) || 0) + exp.amount);
    });

    bucketCatAgg.forEach((val, key) => {
        const [bucket, cat] = key.split('|');
        addNode(cat, "#94a3b8"); // Slate default for sub-cats
        links.push({ source: bucket, target: cat, value: val });
    });

    // 3. Handle Surplus (Savings balance)
    // If Income > Expenses, the remainder stays in Wallet? 
    // Usually Sankey must balance source/target flows roughly or it looks weird.
    // Nivo handles imbalance, but it's nice to show "Unallocated" or "Cash Flow Positive".
    // Let's add "Remaining" flow from Wallet if exists.
    const totalExpenses = expenseBuckets.Needs + expenseBuckets.Wants + expenseBuckets.Savings;
    const remaining = totalIncome - totalExpenses;

    if (remaining > 0) {
        addNode("Unallocated", "#10b981");
        links.push({ source: WALLET_NODE, target: "Unallocated", value: remaining });
    }

    return { nodes, links };
};
