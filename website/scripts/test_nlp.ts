
import { SmartParser } from '../lib/smart_parser';

const testCases = [
    "Lunch 200",
    "200 for Lunch",
    "Uber 450",
    "Paid 500 for Movies",
    "Salary 50000",
    "Received 10k from Mom",
    "5k groceries",
    "Starbucks 350",
    "Netflix subscription 650",
    "Petrol 2000",
    "Lunch 200 Yesterday",
    "Dinner 500 last Friday"
];

console.log("--- Testing SmartParser NLP ---");

testCases.forEach(input => {
    const result = SmartParser.parseNaturalLanguage(input);
    console.log(`Input: "${input}"`);
    if (result) {
        console.log(`  -> [${result.type.toUpperCase()}] ${result.category} / ${result.subcategory}`);
        console.log(`     Amount: ${result.amount}, Desc: "${result.description}"`);
        if (result.date) console.log(`     Date: ${result.date}`);
    } else {
        console.log("  -> FAILED to parse");
    }
    console.log("");
});
