'use client';

import React, { useState } from 'react';

interface ApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    project: any;
}

export default function ApprovalModal({ isOpen, onClose, onConfirm, project }: ApprovalModalProps) {
    const [checks, setChecks] = useState({
        ready: false,
        spelling: false,
        layout: false,
        artwork: false,
        readingDirection: false,
        trim: false,
        interior: false,
        cover: false,
        lamination: false,
        responsibility: false
    });
    const [signature, setSignature] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const allChecked = Object.values(checks).every(val => val === true);
    const canSubmit = allChecked && signature.trim().length > 2;

    const handleConfirm = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        // Simulate delay or wait for parent promise
        await onConfirm();
        setSubmitting(false);
    };

    const toggleCheck = (key: keyof typeof checks) => {
        setChecks(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/90 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg border border-slate-700/50 flex flex-col max-h-[90vh]">

                <div className="p-6 border-b border-slate-700">
                    <h3 className="text-2xl font-bold text-white">Final Approval</h3>
                    <p className="text-gray-400 text-sm mt-1">Please verify all details before proceeding.</p>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">

                    <p className="text-gray-300 text-sm font-medium">By approving this, you acknowledge that:</p>

                    <div className="space-y-3 pl-2">
                        {[
                            { id: 'ready', label: 'Your project is print-ready.' },
                            { id: 'spelling', label: "You've checked for spelling errors." },
                            { id: 'layout', label: "You've checked for layout issues." },
                            { id: 'artwork', label: "You've checked for artwork issues." },
                            { id: 'readingDirection', label: 'I acknowledge the reading direction.' }
                        ].map((item) => (
                            <div key={item.id} className="flex items-start">
                                <input
                                    type="checkbox"
                                    id={`check-${item.id}`}
                                    checked={checks[item.id as keyof typeof checks]}
                                    onChange={() => toggleCheck(item.id as keyof typeof checks)}
                                    className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
                                />
                                <label htmlFor={`check-${item.id}`} className="ml-3 text-sm text-gray-300 cursor-pointer">{item.label}</label>
                            </div>
                        ))}

                        <div className="space-y-2 mt-4 pt-4 border-t border-slate-700/50">
                            {[
                                { id: 'trim', label: `Correct Trim Size: ${project.specs?.dimensions?.width}x${project.specs?.dimensions?.height} ${project.specs?.dimensions?.units || 'in'}` },
                                { id: 'interior', label: `Interior Paper: ${project.specs?.paperType || 'Standard'}` },
                                { id: 'cover', label: `Cover Paper: ${project.specs?.coverPaperType || 'Standard'}` },
                                { id: 'lamination', label: `Lamination: ${project.specs?.lamination || 'None'}` },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center bg-indigo-900/20 p-3 rounded-lg border border-indigo-500/30 cursor-pointer" onClick={() => toggleCheck(item.id as keyof typeof checks)}>
                                    <input
                                        type="checkbox"
                                        checked={checks[item.id as keyof typeof checks]}
                                        onChange={() => {}} // Handled by div click
                                        className="h-5 w-5 rounded border-gray-600 bg-slate-700 text-indigo-500 pointer-events-none"
                                    />
                                    <label className="ml-3 text-sm text-gray-200 font-medium pointer-events-none">{item.label}</label>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-start mt-4 pt-4 border-t border-slate-700/50">
                            <input
                                type="checkbox"
                                id="check-responsibility"
                                checked={checks.responsibility}
                                onChange={() => toggleCheck('responsibility')}
                                className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-700 text-red-500 focus:ring-red-500/50 cursor-pointer"
                            />
                            <label htmlFor="check-responsibility" className="ml-3 text-sm text-red-200/90 leading-tight cursor-pointer">
                                If the proof containing errors is approved, you're responsible for all costs, including corrections and reprints.
                            </label>
                        </div>
                    </div>

                    <div className="pt-6 mt-2">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Electronic Signature (Type Full Name)</label>
                        <input
                            type="text"
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                            className="w-full rounded-lg bg-slate-900/50 border border-slate-600 text-white px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-600"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-800 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canSubmit || submitting}
                        className="px-6 py-2 rounded-lg bg-green-600 text-white font-bold shadow-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center"
                    >
                        {submitting ? 'Approving...' : 'Approve Project'}
                    </button>
                </div>
            </div>
        </div>
    );
}
