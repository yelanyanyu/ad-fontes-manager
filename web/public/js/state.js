// Global State Store
export const store = {
    dbConnected: false,
    localRecords: [],
    dbRecords: [],
    dbListMeta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        search: '',
        sort: 'newest'
    },
    currentLocalId: null, // For single sync conflict resolution
    currentEditingId: null, // Track currently editing LOCAL record ID
    
    // Pagination State
    pagination: {
        currentPage: 1,
        pageSize: 10
    }
};

export function updateState(key, value) {
    store[key] = value;
}
