export class Workspaces {
  constructor(onChange){
    this.value='explore';this.onChange=onChange;
    for(const button of document.querySelectorAll('[data-workspace-button]'))button.addEventListener('click',()=>this.select(button.dataset.workspaceButton));
    this.render();
  }
  select(value){
    if(!['explore','racing','editor'].includes(value)||value===this.value)return;
    const previous=this.value;this.value=value;this.render();this.onChange?.(value,previous);
  }
  render(){
    document.body.dataset.workspace=this.value;
    for(const panel of document.querySelectorAll('[data-workspace-panel]'))panel.hidden=panel.dataset.workspacePanel!==this.value;
    for(const button of document.querySelectorAll('[data-workspace-button]')){const active=button.dataset.workspaceButton===this.value;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  }
}
