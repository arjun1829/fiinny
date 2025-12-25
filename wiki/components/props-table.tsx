
import React from 'react';

export function PropsTable({ props }) {
    if (!props || props.length === 0) {
        return <p className="text-gray-500 italic">No props defined.</p>;
    }

    return (
        <div className="overflow-x-auto my-4 border rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {props.map((prop, index) => (
                        <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{prop.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono">{prop.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {prop.required ? (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Yes</span>
                                ) : (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">No</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">{prop.description}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
