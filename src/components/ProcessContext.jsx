"use client";
import { createContext, useContext, useState, useCallback, useRef } from "react";
import ProcessOverlay from "./ProcessOverlay";

const ProcessContext = createContext(null);

/**
 * Global Process Provider handles the state for the Cinematic Process Overlay
 * Options for variant: 'analyze', 'upload', 'download'
 */
export function ProcessProvider({ children }) {
    const [processState, setProcessState] = useState({
        isActive: false,
        variant: 'analyze',
        progress: 0,
        title: "",
        stepText: "",
        cancellable: false,
    });

    const timersRef = useRef([]);
    // Holds the cancel handler supplied by whoever opened the current process.
    // Kept in a ref (not state) so it's never stale inside the overlay's onClick.
    const cancelHandlerRef = useRef(null);

    const openProcess = useCallback((variant, title, initialStep = "Initializing...", onCancel = null) => {
        cancelHandlerRef.current = onCancel;
        setProcessState({
            isActive: true,
            variant,
            progress: 0,
            title,
            stepText: initialStep,
            cancellable: typeof onCancel === "function",
        });
    }, []);

    const updateProcess = useCallback((progress, stepText) => {
        setProcessState(prev => ({
            ...prev,
            progress: progress !== undefined ? Math.min(100, Math.max(0, progress)) : prev.progress,
            stepText: stepText || prev.stepText,
        }));
    }, []);

    const closeProcess = useCallback(() => {
        // Clear any auto-progression timers
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        cancelHandlerRef.current = null;

        setProcessState(prev => ({ ...prev, progress: 100 })); // Jump to 100 for a smooth exit

        setTimeout(() => {
            setProcessState(prev => ({ ...prev, isActive: false }));
        }, 500); // Allow fade out animation
    }, []);

    // Invoked by the overlay's Cancel button. Runs the registered cancel handler
    // (abort fetches / cancel the queue job) then tears the overlay down immediately.
    const cancelProcess = useCallback(() => {
        const handler = cancelHandlerRef.current;
        cancelHandlerRef.current = null;

        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];

        try { handler?.(); } catch { /* a failed cancel shouldn't block teardown */ }

        // Cancelled processes tear down right away — no "100% then fade" flourish.
        setProcessState(prev => ({ ...prev, isActive: false, cancellable: false }));
    }, []);

    // A helper to auto-simulate progress over a duration
    // Useful for fake progress while waiting for a fetch
    const simulateProgress = useCallback((stages) => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];

        let cumulativeTime = 0;

        stages.forEach(stage => {
            const timer = setTimeout(() => {
                updateProcess(stage.progress, stage.step);
            }, cumulativeTime);
            timersRef.current.push(timer);
            cumulativeTime += stage.duration;
        });

    }, [updateProcess]);

    return (
        <ProcessContext.Provider value={{
            ...processState,
            openProcess,
            updateProcess,
            closeProcess,
            cancelProcess,
            simulateProgress
        }}>
            {children}
            <ProcessOverlay {...processState} onCancel={cancelProcess} />
        </ProcessContext.Provider>
    );
}

export function useProcess() {
    const context = useContext(ProcessContext);
    if (!context) {
        throw new Error("useProcess must be used within a ProcessProvider");
    }
    return context;
}
