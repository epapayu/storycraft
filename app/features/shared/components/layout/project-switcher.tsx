"use client";

import { useState } from "react";
import { Plus, Folder, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    useProjects,
    useSaveProjectMutation,
    useAddProjectMemberMutation,
} from "@/app/features/shared/hooks/use-projects-query";
import { useProjectStore } from "@/app/features/shared/stores/useProjectStore";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function ProjectSwitcher({ isCollapsed }: { isCollapsed: boolean }) {
    const { data: projects = [], isLoading } = useProjects();
    const { activeProjectId, setActiveProjectId } = useProjectStore();
    const saveProjectMutation = useSaveProjectMutation();
    const addMemberMutation = useAddProjectMemberMutation();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");

    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"owner" | "editor" | "viewer">("editor");

    const activeProject = projects.find((p) => p.id === activeProjectId);

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;
        try {
            const result = await saveProjectMutation.mutateAsync(newProjectName);
            setActiveProjectId(result.projectId);
            setNewProjectName("");
            setIsCreateOpen(false);
            toast.success("Project created successfully");
        } catch (err) {
            console.error(err);
        }
    };

    const handleInviteMember = async () => {
        if (!activeProjectId || !inviteEmail.trim()) return;
        try {
            await addMemberMutation.mutateAsync({
                projectId: activeProjectId,
                email: inviteEmail,
                role: inviteRole,
            });
            setInviteEmail("");
            setIsInviteOpen(false);
        } catch (err) {
            console.error(err);
        }
    };

    if (isCollapsed) {
        return (
            <div className="flex h-full items-center justify-center">
                <Folder className="h-5 w-5 text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex w-full items-center gap-2">
            <div className="flex-1">
                <Select
                    value={activeProjectId || "personal"}
                    onValueChange={(value) => {
                        if (value === "create-new") {
                            setIsCreateOpen(true);
                        } else if (value === "personal") {
                            setActiveProjectId(null);
                        } else {
                            setActiveProjectId(value);
                        }
                    }}
                >
                    <SelectTrigger className="w-full bg-card border-border text-sm">
                        <SelectValue placeholder="Personal Workspace">
                            {activeProject ? activeProject.name : "Personal Workspace"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="personal">
                            <div className="flex items-center gap-2">
                                <Folder className="h-4 w-4 opacity-60" />
                                <span>Personal Workspace</span>
                            </div>
                        </SelectItem>
                        {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                <div className="flex items-center gap-2">
                                    <Folder className="h-4 w-4 opacity-60" />
                                    <span>{p.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                        <SelectItem value="create-new" className="text-primary font-medium border-t border-border mt-1">
                            <div className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                <span>Create Project</span>
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Invite Member Button - Only visible when a project is active */}
            {activeProjectId && (
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsInviteOpen(true)}
                    title="Invite Team Member"
                    className="border-border shrink-0"
                >
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                </Button>
            )}

            {/* Create Project Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                Project Name
                            </label>
                            <Input
                                id="name"
                                placeholder="Acme Promo Campaign"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateProject}
                            disabled={saveProjectMutation.isPending}
                        >
                            {saveProjectMutation.isPending ? "Creating..." : "Create Project"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Invite Member Dialog */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <label htmlFor="email" className="text-sm font-medium">
                                Colleague's Email Address
                            </label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="colleague@acme.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-medium">
                                Project Permission Role
                            </label>
                            <Select
                                value={inviteRole}
                                onValueChange={(val) => setInviteRole(val as any)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="editor">Editor (Can Edit Storyboards & Timelines)</SelectItem>
                                    <SelectItem value="viewer">Viewer (Read-only Access)</SelectItem>
                                    <SelectItem value="owner">Co-owner (Full Admin Access)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleInviteMember}
                            disabled={addMemberMutation.isPending}
                        >
                            {addMemberMutation.isPending ? "Inviting..." : "Invite Member"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
