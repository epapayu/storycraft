import { Scenario, TimelineState } from "@/app/types";
import { Timestamp } from "@/lib/storage/firestore";

// Type for Firestore timestamps that can be various forms
export type FirestoreTimestamp =
    | Timestamp
    | Date
    | { seconds: number; nanoseconds: number };

export interface FirestoreUser {
    email: string;
    displayName: string;
    createdAt: FirestoreTimestamp;
    photoURL: string;
}

export interface FirestoreProject {
    id: string;
    name: string;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
    ownerId: string;
    members: Record<string, "owner" | "editor" | "viewer">; // Map of userId -> role
}

export interface FirestoreScenario extends Scenario {
    id: string;
    projectId: string;
    createdBy: string;
    userId?: string; // For backwards compatibility
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

export interface FirestoreTimelineState extends TimelineState {
    projectId: string;
    userId?: string; // For backwards compatibility
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

