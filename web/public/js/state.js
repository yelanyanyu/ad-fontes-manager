// Global State Store
export const store = {
    dbConnected: false,
    localRecords: [],
    allRecords: [],
    currentLocalId: null, // For single sync conflict resolution
    currentEditingId: null, // Track currently editing LOCAL record ID
    
    // Pagination State
    pagination: {
        currentPage: 1,
        pageSize: 20
    }
};

export function updateState(key, value) {
    store[key] = value;
}