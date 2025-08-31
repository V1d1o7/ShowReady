import React, { createContext, useContext } from 'react';

const LibraryContext = createContext(null);

export const useLibrary = () => useContext(LibraryContext);

export const LibraryProvider = ({ children, value }) => {
    return (
        <LibraryContext.Provider value={value}>
            {children}
        </LibraryContext.Provider>
    );
};
