
void * FUN_00402bc0(short param_1,void *param_2)

{
  int *piVar1;
  int iVar2;
  long *plVar3;
  uint uVar4;
  short sVar5;
  int iVar6;
  void *_DstBuf;
  
  sVar5 = 0;
  iVar6 = 0x7fffffff;
  do {
    piVar1 = (int *)FUN_00402ba0(param_1);
    uVar4 = *piVar1 - DAT_00669ca0 >> 0x1f;
    iVar2 = (*piVar1 - DAT_00669ca0 ^ uVar4) - uVar4;
    if (iVar2 < iVar6) {
      iVar6 = iVar2;
      sVar5 = param_1;
    }
    param_1 = *(short *)((int)piVar1 + 0xe);
  } while (param_1 != 0);
  plVar3 = (long *)FUN_00402ba0(sVar5);
  if (param_2 == (void *)0x0) {
    param_2 = (void *)(*(code *)PTR_malloc_00512000)((short)plVar3[3] + 7 + plVar3[2]);
  }
  _DstBuf = param_2;
  if (plVar3[2] != plVar3[1]) {
    _DstBuf = (void *)(((int)(short)plVar3[3] - plVar3[1]) + plVar3[2] + 7 + (int)param_2 &
                      0xfffffffc);
  }
  fseek(DAT_0060de40,*plVar3,0);
  fread(_DstBuf,1,plVar3[1],DAT_0060de40);
  DAT_00669ca0 = plVar3[1] + *plVar3;
  if (plVar3[2] != plVar3[1]) {
    FUN_00402cf0(_DstBuf,param_2);
  }
  return param_2;
}

