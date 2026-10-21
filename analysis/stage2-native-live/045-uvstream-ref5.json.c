
undefined4 FUN_00453a00(int param_1,uint *param_2,int param_3)

{
  longlong lVar1;
  uint uVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  int iVar6;
  int local_c;
  int local_8;
  
  if (param_2 == (uint *)0x0) {
    uVar2 = FUN_00444ad0();
    local_c = (int)((uVar2 ^ (int)uVar2 >> 0x1f) - ((int)uVar2 >> 0x1f)) >> 0xe;
    if (0x7f < local_c) {
      local_c = 0x7f;
    }
  }
  else {
    uVar2 = *param_2 & 0x1ff;
    if (uVar2 == 0xc) {
      if (*(char *)(param_1 + 0x720) != '\b') {
        FUN_00408950(0xc);
        return 1;
      }
      FUN_004088b0();
      return 1;
    }
    if (uVar2 == 0x15) {
      return 1;
    }
    local_c = FUN_004a5110();
    local_c = local_c >> 7;
    if (0x7f < local_c) {
      local_c = 0x7f;
    }
    if (uVar2 == 3) {
      if (*(char *)(param_1 + 0x720) == '\b') {
        FUN_00408850();
      }
      else {
        FUN_004088f0(local_c);
      }
      if ((*(char *)(param_1 + 0x720) == '\b') && ((char)param_2[0x1c8] != '\b')) {
        FUN_004085f0();
      }
    }
    else if (uVar2 == 0x11) {
      if (*(char *)(param_1 + 0x720) == '\b') {
        FUN_004088b0();
      }
      else {
        FUN_00408950(0x11);
      }
    }
  }
  iVar3 = 0xff;
  if (local_c * 8 < 0xff) {
    iVar3 = local_c * 8;
  }
  if ((int)(uint)*(byte *)(param_1 + 0x685) < iVar3) {
    *(char *)(param_1 + 0x685) = (char)iVar3;
    iVar3 = *(int *)(param_3 + 0x30);
    iVar5 = *(int *)(param_3 + 0x34);
    *(int *)(param_1 + 0x694) = *(int *)(param_1 + 0x2c) + *(int *)(param_3 + 0x2c) * -0x100;
    *(int *)(param_1 + 0x698) = *(int *)(param_1 + 0x30) + iVar3 * -0x100;
    *(int *)(param_1 + 0x69c) = *(int *)(param_1 + 0x34) + iVar5 * -0x100;
    FUN_004170b0();
    iVar3 = FUN_00445500();
    if (iVar3 < 0x40) {
      *(undefined8 *)(param_1 + 0x694) = *(undefined8 *)(param_1 + 0x688);
      *(undefined4 *)(param_1 + 0x69c) = *(undefined4 *)(param_1 + 0x690);
    }
    else {
      FUN_00445490();
    }
  }
  iVar3 = *(int *)(param_3 + 0x38) >> 8;
  iVar5 = *(int *)(param_3 + 0x3c) >> 8;
  iVar6 = *(int *)(param_3 + 0x40) >> 8;
  if (param_1 != *(int *)(param_3 + 4)) {
    iVar3 = -iVar3;
    iVar5 = -iVar5;
    iVar6 = -iVar6;
  }
  if (0x1f < local_c) {
    local_8 = (int)*(short *)(param_1 + 0xae);
    param_2 = (uint *)(int)*(short *)(param_1 + 0xb4);
    iVar4 = (int)*(short *)(param_1 + 0xba);
    if (*(char *)(param_1 + 0x65f) == '\0') {
      local_8 = -local_8;
      param_2 = (uint *)-(int)param_2;
      iVar4 = -iVar4;
    }
    lVar1 = (longlong)(iVar4 * iVar6 + (int)param_2 * iVar5 + local_8 * iVar3 >> 4) *
            (longlong)local_c;
    local_c = local_c - ((uint)lVar1 >> 0x10 | (int)((ulonglong)lVar1 >> 0x20) << 0x10);
    if (0x1f < local_c) {
      *(undefined1 *)(param_1 + 0x687) = 1;
    }
  }
  if (*(int **)(param_1 + 0x6c0) == (int *)0xffffffff) {
    iVar3 = -1;
  }
  else {
    iVar3 = **(int **)(param_1 + 0x6c0);
  }
  if (3 < *(short *)(param_1 + 0x678)) {
    FUN_00454340(0x17 - (uint)(iVar3 != 1));
  }
  if ((iVar3 == 1) && (0x1f < local_c)) {
    FUN_0048e0f0(local_c);
    return 1;
  }
  return 1;
}

