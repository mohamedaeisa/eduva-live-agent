export const modules: any[] = [];

export function registerModule(m: any) {
    modules.push(m);
}

export function getModules() {
    return modules;
}
