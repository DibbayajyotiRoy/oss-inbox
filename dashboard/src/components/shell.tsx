// Compatibility shim: the shell lives in ./shell/. New code imports from there.
export { Shell } from "./shell/app-shell";
export { useMe, useShell } from "./shell/shell-context";
