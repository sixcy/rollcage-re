
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0048b590(void)

{
  undefined4 uVar1;
  undefined4 uVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  short sVar5;
  short sVar6;
  short sVar7;
  short sVar8;
  short sVar9;
  short sVar10;
  short sVar11;
  short sVar12;
  short sVar13;
  undefined2 uVar14;
  short sVar15;
  short sVar16;
  short sVar17;
  int iVar18;
  short *psVar19;
  int in_ECX;
  uint uVar20;
  int iVar21;
  int in_EDX;
  ushort uStack_2a;
  ushort uStack_22;
  undefined2 uStack_6;
  
  if (((*(uint *)(in_ECX + 0x168) & 0xffff0000) == 0x10000) && ('\x02' < *(char *)(in_ECX + 0x16e)))
  {
    return;
  }
  iVar18 = (int)*(char *)(in_ECX + 0x16e) + (int)*(short *)(in_ECX + 0x16c);
  iVar21 = iVar18 + -1;
  if (in_EDX != 0) {
    iVar21 = iVar18;
  }
  uVar1 = *(undefined4 *)(in_ECX + 0xac);
  uVar2 = *(undefined4 *)(in_ECX + 0xb0);
  uVar3 = *(undefined4 *)(in_ECX + 0xb4);
  uVar4 = *(undefined4 *)(in_ECX + 0xb8);
  _DAT_006961b0 = *(undefined4 *)(in_ECX + 0xbc);
  DAT_006961a0 = (short)uVar1;
  _DAT_006962e0 = (float)DAT_006961a0 * 0.00024414062;
  DAT_006961a2 = (short)((uint)uVar1 >> 0x10);
  _DAT_006962e4 = (float)DAT_006961a2 * 0.00024414062;
  DAT_006961a4 = (short)uVar2;
  _DAT_006962e8 = (float)DAT_006961a4 * 0.00024414062;
  DAT_006961a6 = (short)((uint)uVar2 >> 0x10);
  _DAT_006962f0 = (float)DAT_006961a6 * 0.00024414062;
  DAT_006961a8 = (short)uVar3;
  _DAT_006962f4 = (float)DAT_006961a8 * 0.00024414062;
  DAT_006961aa = (short)((uint)uVar3 >> 0x10);
  _DAT_006962f8 = (float)DAT_006961aa * 0.00024414062;
  DAT_006961ac = (short)uVar4;
  _DAT_00696300 = (float)DAT_006961ac * 0.00024414062;
  DAT_006961ae = (short)((uint)uVar4 >> 0x10);
  _DAT_00696304 = (float)DAT_006961ae * 0.00024414062;
  _DAT_00696308 = (float)DAT_006961b0 * 0.00024414062;
  sVar15 = *(short *)(in_ECX + 0x2e);
  sVar16 = *(short *)(in_ECX + 0x32);
  sVar17 = *(short *)(in_ECX + 0x36);
  uVar14 = 0xffec;
  iVar21 = (iVar21 % 0x28) * 0x20 + in_ECX;
  if (*(short *)(in_ECX + 0x168) == 1) {
    uVar14 = 0xffd8;
  }
  _DAT_00696224 = 0;
  _DAT_00696228 = CONCAT22(uStack_6,uVar14);
  _DAT_006961a0 = uVar1;
  _DAT_006961a4 = uVar2;
  _DAT_006961a8 = uVar3;
  _DAT_006961ac = uVar4;
  FUN_004a5b60();
  sVar11 = (short)DAT_00696290;
  sVar8 = (short)DAT_0069628c;
  sVar5 = (short)DAT_00696288;
  if ((*(short *)(in_ECX + 0x168) == 2) || (*(short *)(in_ECX + 0x168) != 3)) {
    uVar20 = 0x30;
    if (in_EDX != 2) goto LAB_0048b7e9;
    uVar20 = 0x30;
    iVar18 = *(int *)(in_ECX + 0x164) << 3;
  }
  else {
    uVar20 = 0xc;
    if (in_EDX != 2) goto LAB_0048b7e9;
    iVar18 = *(int *)(in_ECX + 0x164) * 2;
  }
  uVar20 = uVar20 - iVar18;
  if ((int)uVar20 < 1) {
    uVar20 = 1;
  }
LAB_0048b7e9:
  _DAT_00696224 = (uint)(ushort)-(short)uVar20 << 0x10;
  _DAT_00696228 = (uint)uStack_22 << 0x10;
  FUN_004a5b60();
  sVar12 = (short)DAT_00696290;
  sVar9 = (short)DAT_0069628c;
  sVar6 = (short)DAT_00696288;
  _DAT_00696224 = uVar20 & 0xffff;
  _DAT_00696228 = (uint)uStack_2a << 0x10;
  FUN_004a5b60();
  sVar13 = (short)DAT_00696290;
  sVar10 = (short)DAT_0069628c;
  sVar7 = (short)DAT_00696288;
  sVar15 = sVar15 + sVar5;
  sVar17 = sVar17 + sVar11;
  sVar16 = sVar16 + sVar8;
  *(short *)(iVar21 + 0x19c) = sVar6 + sVar15;
  *(short *)(iVar21 + 0x19e) = sVar9 + sVar16;
  *(short *)(iVar21 + 0x1a0) = sVar17 + sVar12;
  *(short *)(iVar21 + 0x1a4) = sVar7 + sVar15;
  *(short *)(iVar21 + 0x1a6) = sVar16 + sVar10;
  *(short *)(iVar21 + 0x1a8) = sVar13 + sVar17;
  *(short *)(iVar21 + 0x1ac) = sVar15 - sVar6;
  *(short *)(iVar21 + 0x1ae) = sVar16 - sVar9;
  *(short *)(iVar21 + 0x1b0) = sVar17 - sVar12;
  *(short *)(iVar21 + 0x1b8) = sVar17 - sVar13;
  *(short *)(iVar21 + 0x1b4) = sVar15 - sVar7;
  *(short *)(iVar21 + 0x1b6) = sVar16 - sVar10;
  if (in_EDX != 0) {
    if (*(char *)(in_ECX + 0x16e) < '(') {
      *(char *)(in_ECX + 0x16e) = *(char *)(in_ECX + 0x16e) + '\x01';
    }
    else {
      *(short *)(in_ECX + 0x16c) = *(short *)(in_ECX + 0x16c) + 1;
      if (*(short *)(in_ECX + 0x16c) == 0x28) {
        *(undefined2 *)(in_ECX + 0x16c) = 0;
      }
    }
  }
  if (in_EDX == 2) {
    sVar15 = (short)(*(int *)(in_ECX + 0x18c) >> 0xc) + *(short *)(in_ECX + 0x62);
    sVar16 = (short)(*(int *)(in_ECX + 400) >> 0xc) + *(short *)(in_ECX + 0x66);
    sVar17 = (short)(*(int *)(in_ECX + 0x194) >> 0xc) + *(short *)(in_ECX + 0x6a);
    psVar19 = (short *)(*(short *)(in_ECX + 0x16c) * 0x20 + 0x19c + in_ECX);
    iVar21 = *(char *)(in_ECX + 0x16e) + -1;
    if (0 < iVar21) {
      do {
        *psVar19 = *psVar19 - sVar15;
        psVar19[1] = psVar19[1] - sVar16;
        psVar19[2] = psVar19[2] - sVar17;
        psVar19[4] = psVar19[4] - sVar15;
        psVar19[5] = psVar19[5] - sVar16;
        psVar19[6] = psVar19[6] - sVar17;
        psVar19[8] = psVar19[8] - sVar15;
        psVar19[9] = psVar19[9] - sVar16;
        psVar19[10] = psVar19[10] - sVar17;
        psVar19[0xc] = psVar19[0xc] - sVar15;
        psVar19[0xd] = psVar19[0xd] - sVar16;
        psVar19[0xe] = psVar19[0xe] - sVar17;
        iVar21 = iVar21 + -1;
        psVar19 = psVar19 + 0x10;
      } while (iVar21 != 0);
    }
  }
  return;
}

