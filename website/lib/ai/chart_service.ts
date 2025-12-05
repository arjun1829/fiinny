export type ChartType = 'pie' | 'bar' | 'line' | 'area';

export interface ChartDataPoint {
    name: string;
    value: number;
    fill?: string; // Optional color override
}

export interface ChartConfig {
    type: ChartType;
    title: string;
    data: ChartDataPoint[];
    xLabel?: string;
    yLabel?: string;
}

// Helper to validate chart config
export const isValidChartConfig = (config: any): config is ChartConfig => {
    return (
        config &&
        typeof config.title === 'string' &&
        Array.isArray(config.data) &&
        config.data.length > 0 &&
        ['pie', 'bar', 'line', 'area'].includes(config.type)
    );
};
