import React,
{
    createContext,
    useContext
} from 'react';

const ShowContext = createContext(null);

export const useShow = () => useContext(ShowContext);

export const ShowProvider = ({
    children,
    value
}) => {
    return (
        <ShowContext.Provider value={value}>
            {children}
        </ShowContext.Provider>
    );
};
