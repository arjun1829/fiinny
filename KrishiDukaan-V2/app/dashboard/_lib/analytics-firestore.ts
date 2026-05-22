import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export type SearchAppearanceStats = {
  impressions: string;
  ctr: string;
  avgPosition: string;
};

type DaySeries = {
  key: string;
  label: string;
};

function getLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLast7Days(): DaySeries[] {
  const today = new Date();
  const days: DaySeries[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({
      key: getLocalDayKey(d),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return days;
}

export async function fetchRetailerAnalytics(retailerId: string) {
  try {
    const q = query(collection(db, "products"), where("retailerId", "==", retailerId));
    const snapshot = await getDocs(q);
    
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPositionSum = 0;
    let productsWithImpressions = 0;
    const days = getLast7Days();
    const viewsByDay: Record<string, number> = {};
    const callsByDay: Record<string, number> = {};
    const directionsByDay: Record<string, number> = {};

    days.forEach((day) => {
      viewsByDay[day.key] = 0;
      callsByDay[day.key] = 0;
      directionsByDay[day.key] = 0;
    });

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const impressions = Number(data.impressions || 0);
      const clicks = Number(data.clicks || 0);
      const positionSum = Number(data.positionSum || 0);
      const impressionsByDay = data.impressionsByDay || {};
      const callsDay = data.callsByDay || {};
      const directionsDay = data.directionRequestsByDay || {};

      totalImpressions += impressions;
      totalClicks += clicks;
      totalPositionSum += positionSum;
      if (impressions > 0) {
        productsWithImpressions++;
      }

      days.forEach((day) => {
        viewsByDay[day.key] += Number(impressionsByDay?.[day.key] || 0);
        callsByDay[day.key] += Number(callsDay?.[day.key] || 0);
        directionsByDay[day.key] += Number(directionsDay?.[day.key] || 0);
      });
    });

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition = totalImpressions > 0 ? totalPositionSum / totalImpressions : 0;

    // Formatting
    const impressionsFormatted = totalImpressions >= 1000 
      ? (totalImpressions / 1000).toFixed(1) + 'k' 
      : totalImpressions.toString();

    return {
      totalImpressions,
      totalClicks,
      productCount: snapshot.docs.length,
      searchAppearance: {
        impressions: impressionsFormatted,
        ctr: ctr.toFixed(1) + '%',
        avgPosition: avgPosition > 0 ? avgPosition.toFixed(1) : '—'
      },
      viewsOverTime: days.map((day) => ({
        label: day.label,
        value: viewsByDay[day.key] || 0,
      })),
      callsOverTime: days.map((day) => ({
        label: day.label,
        value: callsByDay[day.key] || 0,
      })),
      directionRequests: days.map((day) => ({
        label: day.label,
        value: directionsByDay[day.key] || 0,
      })),
    };
  } catch (error) {
    console.error("Error fetching retailer analytics:", error);
    throw error;
  }
}
