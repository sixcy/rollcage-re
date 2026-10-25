// A preview-only wire overlay, sharing the renderer's line shader and camera.
// No collision geometry/settings enter the simulation from this component.
export class CollisionOverlay {
  constructor(renderer){this.renderer=renderer;this.groups=[];this.draws=0;}
  clear(){for(const group of this.groups)this.renderer.gl.deleteBuffer(group.buffer);this.groups=[];this.draws=0;}
  set(preview){
    this.clear();const gl=this.renderer.gl;
    for(const group of preview.groups)for(const key of ['lines','normals'])if(group[key].length){
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(group[key]),gl.STATIC_DRAW);
      this.groups.push({buffer,count:group[key].length/3,active:group.active,normals:key==='normals',color:group.color,width:group.width,outline:group.outline});
    }
  }
  render(navigation,{show,disabled,normals}){
    this.draws=0;if(!show||!this.groups.length)return;
    const r=this.renderer,gl=r.gl;gl.useProgram(r.pathProgram);
    for(const attribute of Object.values(r.attributes))gl.disableVertexAttribArray(attribute);
    gl.enableVertexAttribArray(r.pathPosition);gl.uniformMatrix4fv(r.pathUniforms.mvp,false,navigation.matrix(r.canvas.width/r.canvas.height));
    gl.depthMask(false);gl.disable(gl.DEPTH_TEST);
    try{for(const group of this.groups){
      if((!group.active&&!disabled)||(group.normals&&!normals))continue;
      gl.bindBuffer(gl.ARRAY_BUFFER,group.buffer);gl.vertexAttribPointer(r.pathPosition,3,gl.FLOAT,false,12,0);
      const color=group.color??(!group.active?[0.55,0.58,0.64]:group.normals?[1,0.72,0.25]:[0.15,1,1]);
      if(group.width||group.outline)r.drawPathLines(group.count,color,{width:group.width,outline:group.outline});
      else{gl.uniform3fv(r.pathUniforms.color,color);gl.drawArrays(gl.LINES,0,group.count);}this.draws+=group.count/2;
    }}finally{gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disableVertexAttribArray(r.pathPosition);gl.useProgram(r.program);}
  }
}
