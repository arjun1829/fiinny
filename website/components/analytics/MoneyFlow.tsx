"use client";

import { ResponsiveSankey } from "@nivo/sankey";
import { SankeyData } from "@/lib/analytics/sankeyData";

const MoneyFlow = ({ data }: { data: SankeyData }) => {
    if (!data || data.nodes.length === 0 || data.links.length === 0) {
        return (
            <div className="h-[400px] flex items-center justify-center text-slate-400">
                Not enough data to visualize flow. Add some income and expenses!
            </div>
        );
    }

    return (
        <div className="h-[500px] w-full bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl overflow-hidden">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-emerald-400">River of Money</span> 🌊
            </h3>
            <ResponsiveSankey
                data={data}
                margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
                align="justify"
                colors={(node: any) => node.nodeColor || "#94a3b8"}
                nodeOpacity={1}
                nodeHoverOthersOpacity={0.35}
                nodeThickness={18}
                nodeSpacing={24}
                nodeBorderWidth={0}
                nodeBorderColor={{
                    from: 'color',
                    modifiers: [['darker', 0.8]],
                }}
                linkOpacity={0.5}
                linkHoverOthersOpacity={0.1}
                linkContract={3}
                enableLinkGradient={true}
                labelPosition="outside"
                labelOrientation="horizontal"
                labelPadding={16}
                labelTextColor={{
                    from: 'color',
                    modifiers: [['brighter', 1]],
                }}
                theme={{
                    text: {
                        fill: "#e2e8f0",
                        fontSize: 12,
                        fontWeight: 600
                    },
                    tooltip: {
                        container: {
                            background: "#0f172a",
                            color: "#f8fafc",
                            fontSize: "13px",
                            borderRadius: "8px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                            border: "1px solid #1e293b"
                        },
                    },
                }}
            />
        </div>
    );
};

export default MoneyFlow;
