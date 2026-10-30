export const join = (folder: string, name: string) => (folder === "" ? name : `${folder}/${name}`);

export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
