import { api } from '../lib/api-client';
import type { ApiTask, TaskListResponse, TaskCreateResponse, TaskUpdateResponse, TaskDeleteResponse, TaskCompleteResponse, TaskUncompleteResponse } from '../types/api';

export async function listTasks(opts: { date?: string; backlog?: boolean; tag?: string }): Promise<TaskListResponse> {
  return api.get<TaskListResponse>('/api/tasks', {
    date: opts.date,
    backlog: opts.backlog ? 'true' : undefined,
    tag: opts.tag,
  });
}

export async function getTask(id: string): Promise<ApiTask> {
  return api.get<ApiTask>(`/api/tasks/${encodeURIComponent(id)}`);
}

export async function createTask(body: Record<string, unknown>): Promise<TaskCreateResponse> {
  return api.post<TaskCreateResponse>('/api/tasks', body);
}

export async function updateTask(id: string, body: Record<string, unknown>): Promise<TaskUpdateResponse> {
  return api.patch<TaskUpdateResponse>(`/api/tasks/${encodeURIComponent(id)}`, body);
}

export async function deleteTask(id: string): Promise<TaskDeleteResponse> {
  return api.del<TaskDeleteResponse>(`/api/tasks/${encodeURIComponent(id)}`);
}

export async function completeTask(id: string, date?: string): Promise<TaskCompleteResponse> {
  return api.post<TaskCompleteResponse>(`/api/tasks/${encodeURIComponent(id)}/complete`, date ? { date } : undefined);
}

export async function uncompleteTask(taskHistoryId: string): Promise<TaskUncompleteResponse> {
  return api.post<TaskUncompleteResponse>(`/api/tasks/${encodeURIComponent(taskHistoryId)}/uncomplete`);
}
