import { createContext, useContext } from 'react';

export const ShowsContext = createContext(null);

export const useShows = () => {
    return useContext(ShowsContext);
};
