// Browser checks use the same workspace/tool controls as a user.
export async function selectViewerWorkspace(page,workspace,tool) {
  const current=await page.evaluate(()=>window.rollcageViewer.inspect().workspace);
  if(current!==workspace)await page.locator('#workspace-'+workspace).click();
  if(workspace==='editor'&&tool&&await page.locator('#editor-tool').inputValue()!==tool)await page.selectOption('#editor-tool',tool);
  await page.waitForFunction(()=>!window.rollcageViewer.inspect().editor?.busy&&!window.rollcageViewer.inspect().loading);
}
