
void FUN_00444fd0(void)

{
  longlong lVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  uint uVar5;
  uint uVar6;
  uint uVar7;
  uint uVar8;
  uint uVar9;
  int *in_ECX;
  int iVar10;
  undefined2 *in_EDX;
  
  lVar1 = (longlong)in_ECX[1] * (longlong)in_ECX[1];
  uVar5 = (uint)lVar1 >> 0x10 | (int)((ulonglong)lVar1 >> 0x20) << 0x10;
  lVar1 = (longlong)in_ECX[2] * (longlong)in_ECX[2];
  uVar6 = (uint)lVar1 >> 0x10 | (int)((ulonglong)lVar1 >> 0x20) << 0x10;
  lVar1 = (longlong)in_ECX[3] * (longlong)in_ECX[3];
  uVar7 = (uint)((longlong)in_ECX[1] * (longlong)*in_ECX) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[1] * (longlong)*in_ECX) >> 0x20) << 0x10;
  uVar8 = (uint)((longlong)in_ECX[2] * (longlong)*in_ECX) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[2] * (longlong)*in_ECX) >> 0x20) << 0x10;
  uVar9 = (uint)((longlong)in_ECX[3] * (longlong)*in_ECX) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[3] * (longlong)*in_ECX) >> 0x20) << 0x10;
  iVar2 = ((uint)((longlong)in_ECX[1] * (longlong)in_ECX[2]) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[1] * (longlong)in_ECX[2]) >> 0x20) << 0x10) * 2;
  iVar3 = ((uint)((longlong)in_ECX[1] * (longlong)in_ECX[3]) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[1] * (longlong)in_ECX[3]) >> 0x20) << 0x10) * 2;
  iVar10 = ((uint)lVar1 >> 0x10 | (int)((ulonglong)lVar1 >> 0x20) << 0x10) * -2 + 0x10000;
  iVar4 = ((uint)((longlong)in_ECX[2] * (longlong)in_ECX[3]) >> 0x10 |
          (int)((ulonglong)((longlong)in_ECX[2] * (longlong)in_ECX[3]) >> 0x20) << 0x10) * 2;
  *in_EDX = (short)((int)(iVar10 + uVar6 * -2) >> 4);
  in_EDX[1] = (short)((int)(iVar2 + uVar9 * -2) >> 4);
  in_EDX[2] = (short)((int)(uVar8 * 2 + iVar3) >> 4);
  in_EDX[3] = (short)((int)(iVar2 + uVar9 * 2) >> 4);
  in_EDX[4] = (short)((int)(iVar10 + uVar5 * -2) >> 4);
  in_EDX[5] = (short)((int)(iVar4 + uVar7 * -2) >> 4);
  in_EDX[6] = (short)((int)(iVar3 + uVar8 * -2) >> 4);
  in_EDX[7] = (short)((int)(iVar4 + uVar7 * 2) >> 4);
  in_EDX[8] = (short)((int)(uVar6 * -2 + 0x10000 + uVar5 * -2) >> 4);
  return;
}

