/**
 * Centralized types for server actions
 */

/**
 * Generic result type for server actions
 * Provides consistent error handling across all actions
 */
export type ActionResult<T = void> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: string; data?: undefined };

/**
 * Common pagination parameters for list queries
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Generic paginated response structure
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  pageCount: number;
}
