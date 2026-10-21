
int FUN_00409750(void)

{
  ushort uVar1;
  uint uVar2;
  int *piVar3;
  uint in_ECX;
  uint in_EDX;
  int iVar4;
  int iVar5;
  int iVar6;
  ushort uVar7;
  int iVar8;
  bool bVar9;
  bool bVar10;
  ushort local_18;
  ushort local_14;
  
  iVar4 = (in_EDX & 0xffff) * 0x10 +
          *(int *)(*(int *)(DAT_00791598 + 0x60) + 8 + (in_ECX & 0xffff) * 0xc);
  uVar2 = *(uint *)(iVar4 + 0xc) >> 9;
  local_18 = (ushort)(*(uint *)(iVar4 + 0xc) >> 0xe) & 0x1ff;
  uVar1 = (ushort)((uint)*(undefined4 *)(iVar4 + 8) >> 0x10);
  uVar7 = uVar1 >> 0xb;
  bVar9 = uVar7 == 0;
  bVar10 = (uVar2 & 0x1f) == 0;
  if ((uVar7 == 0) && ((uVar2 & 0x1f) == 0)) {
    return 0;
  }
  iVar8 = 0;
  piVar3 = &DAT_00836bd0;
  iVar5 = -50000;
  do {
    uVar7 = *(ushort *)(piVar3 + -0xc);
    iVar6 = iVar5;
    if (uVar7 != 0) {
      if ((((ushort)*(byte *)((int)piVar3 + -0x2e) == (*(ushort *)(iVar4 + 0xc) & 0x1ff)) &&
          (local_14 = uVar1 >> 0xb, uVar7 == local_14)) && (iVar6 = *piVar3, iVar5 < iVar6)) {
        bVar9 = true;
      }
      else {
        iVar6 = iVar5;
        if (((*(byte *)((int)piVar3 + -0x2e) == local_18) && (uVar7 == ((ushort)uVar2 & 0x1f))) &&
           (iVar5 < *piVar3)) {
          bVar10 = true;
          iVar6 = *piVar3;
        }
        if (!bVar9) goto LAB_0040982d;
      }
      if (bVar10) {
        return iVar6;
      }
    }
LAB_0040982d:
    iVar8 = iVar8 + 1;
    piVar3 = piVar3 + 0xd;
    iVar5 = iVar6;
    if (0x13 < iVar8) {
      if (iVar6 == -50000) {
        iVar6 = 0;
      }
      return iVar6;
    }
  } while( true );
}

