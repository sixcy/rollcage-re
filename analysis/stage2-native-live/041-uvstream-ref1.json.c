
undefined4 FUN_004122e0(uint param_1,undefined4 param_2)

{
  uint *puVar1;
  int iVar2;
  int iVar3;
  undefined1 uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  int in_ECX;
  uint *in_EDX;
  undefined4 uVar8;
  uint local_c;
  
  uVar4 = 0xff;
  if (*(short *)(in_ECX + 0x174) == -1) {
    return 0;
  }
  uVar5 = *(uint *)(*(int *)(in_ECX + 0x178) + param_1 * 4) & 0x7000000;
  if ((uVar5 != 0x3000000) && (uVar5 != 0x4000000)) {
    if (((*in_EDX & 0x1ff) != 0xc) && ((*in_EDX & 0x1ff) != 0x11)) {
      return 0;
    }
    iVar7 = *(int *)(in_ECX + 0x194);
    while (iVar3 = iVar7, iVar3 != 0) {
      in_ECX = iVar3;
      iVar7 = *(int *)(iVar3 + 0x194);
    }
    if (*(char *)(in_ECX + 0x17c) == '\0') {
      return 0;
    }
    param_1 = 0;
    uVar5 = (uint)*(byte *)(*(int *)(in_ECX + 0x10) + 0x27);
    if (uVar5 == 0) {
      return 0;
    }
    while ((uVar6 = *(uint *)(*(int *)(in_ECX + 0x178) + param_1 * 4) & 0x7000000,
           uVar6 != 0x3000000 && (uVar6 != 0x4000000))) {
      param_1 = param_1 + 1;
      if (uVar5 <= param_1) {
        return 0;
      }
    }
    if ((int)param_1 < 0) {
      return 0;
    }
  }
  iVar3 = *(int *)(in_ECX + 0x194);
  iVar7 = in_ECX;
  while (iVar2 = iVar3, iVar2 != 0) {
    iVar7 = iVar2;
    iVar3 = *(int *)(iVar2 + 0x194);
  }
  if (*(char *)(iVar7 + 0x17c) == '\0') {
    return 0;
  }
  puVar1 = (uint *)(*(int *)(in_ECX + 0x178) + param_1 * 4);
  iVar7 = FUN_004a5110();
  local_c = in_EDX[0x24];
  uVar5 = *in_EDX & 0x1ff;
  if (uVar5 == 3) {
    uVar4 = FUN_00412190();
  }
  else {
    if (uVar5 == 0xc) {
      uVar5 = 0;
      do {
        if (((uint *)(&DAT_006ba580)[uVar5] == in_EDX) &&
           ((((uint *)(&DAT_006ba580)[uVar5])[0x5a] & 0xffff0000) != 0)) goto LAB_0041246d;
        uVar5 = uVar5 + 1;
      } while (uVar5 < 0x26);
      local_c = local_c << 6;
      uVar8 = 1;
      goto LAB_004124d1;
    }
    if (uVar5 == 0x11) {
      uVar5 = 0;
      do {
        if (((uint *)(&DAT_006ba570)[uVar5] == in_EDX) &&
           (((uint *)(&DAT_006ba570)[uVar5])[0x61] != 0)) goto LAB_0041246d;
        uVar5 = uVar5 + 1;
      } while (uVar5 < 4);
      local_c = local_c << 6;
      uVar8 = 1;
      goto LAB_004124d1;
    }
    uVar4 = 0xff;
    local_c = ((int)local_c >> 2) + ((int)local_c >> 1);
  }
  uVar8 = 0;
LAB_004124d1:
  uVar5 = *puVar1;
  iVar7 = (uVar5 >> 0x1c) -
          ((uint)((longlong)(int)local_c * (longlong)iVar7) >> 0x10 |
          (int)((ulonglong)((longlong)(int)local_c * (longlong)iVar7) >> 0x20) << 0x10);
  if (0 < iVar7) {
    return 0;
  }
  *puVar1 = uVar5 & 0xfffffff;
  FUN_00412800(param_2,iVar7,uVar8,uVar4);
  return 1;
LAB_0041246d:
  uVar4 = FUN_00412190();
  local_c = local_c << 6;
  uVar8 = 1;
  goto LAB_004124d1;
}

