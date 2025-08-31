import React from 'react';

const FolderOptions = ({ folders, currentFolderId = null, indent = 0 }) => {
    const prefix = '\u00A0\u00A0'.repeat(indent); // Indentation using non-breaking spaces
    
    return folders.map(folder => {
        if (folder.id === currentFolderId) return null;

        return (
            <React.Fragment key={folder.id}>
                <option value={folder.id}>{prefix}{folder.name}</option>
                {folder.children && folder.children.length > 0 && (
                    <FolderOptions folders={folder.children} currentFolderId={currentFolderId} indent={indent + 1} />
                )}
            </React.Fragment>
        );
    });
};

export default FolderOptions;