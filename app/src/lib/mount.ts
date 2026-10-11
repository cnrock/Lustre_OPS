// 前端共享的 Lustre 客户端挂载点。
// 优先取后端返回的 client_mount（由 LUSTRE_CLIENT_MOUNT 决定）；
// 构建时可用 VITE_LUSTRE_MOUNT 覆盖默认值。
export const LUSTRE_MOUNT = (import.meta as any).env?.VITE_LUSTRE_MOUNT || '/lustre';

let dynamicMount = '';
export function setMountPoint(mp?: string | null) {
  if (mp) dynamicMount = mp;
}
export function mountPoint(): string {
  return dynamicMount || LUSTRE_MOUNT;
}
