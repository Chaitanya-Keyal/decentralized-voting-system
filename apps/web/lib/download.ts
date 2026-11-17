/** Saves `contents` as a file in the browser's downloads. It is made here: nothing is fetched. */
export function downloadFile(name: string, contents: string, type: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([contents], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
