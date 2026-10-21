
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00447630(void)

{
  undefined1 uVar1;
  ushort uVar2;
  short sVar3;
  int iVar4;
  undefined4 uVar5;
  undefined4 uVar6;
  undefined4 uVar7;
  int iVar8;
  undefined4 uVar9;
  undefined4 uVar10;
  short sVar11;
  int iVar12;
  int iVar13;
  int iVar14;
  int iVar15;
  int iVar16;
  int in_ECX;
  int iVar17;
  int iVar18;
  uint uVar19;
  int iVar20;
  uint uVar21;
  uint *puVar22;
  int iVar23;
  short sVar24;
  int iVar25;
  int iVar26;
  int iVar27;
  undefined4 local_6c;
  undefined4 local_68;
  undefined4 local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined4 local_44;
  undefined4 local_40;
  uint local_3c;
  undefined1 *local_38;
  ushort *local_30;
  int *local_8;
  
  iVar8 = DAT_00768dfc;
  sVar24 = *(short *)(in_ECX + 0x12);
  sVar11 = *(short *)(in_ECX + 0x10);
  local_40 = 0;
  if (*(short *)(in_ECX + 0xe) != 0) {
    FUN_00445360();
    sVar11 = *(short *)(in_ECX + 0x10);
  }
  if (sVar11 != 0) {
    FUN_00445360();
  }
  if (sVar24 != 0) {
    local_40 = FUN_00445360();
  }
  FUN_004452b0();
  FUN_00444fd0();
  _DAT_006961a0 = local_6c;
  uVar5 = _DAT_006961a0;
  _DAT_006961a4 = local_68;
  uVar9 = _DAT_006961a4;
  _DAT_006961a8 = local_64;
  uVar10 = _DAT_006961a8;
  _DAT_006961ac = local_60;
  uVar6 = _DAT_006961ac;
  _DAT_006961b0 = local_5c;
  uVar7 = _DAT_006961b0;
  DAT_006961a0 = (short)local_6c;
  _DAT_006962e0 = (float)DAT_006961a0 * 0.00024414062;
  DAT_006961a2 = (short)((uint)local_6c >> 0x10);
  _DAT_006962e4 = (float)DAT_006961a2 * 0.00024414062;
  DAT_006961a4 = (short)local_68;
  _DAT_006962e8 = (float)DAT_006961a4 * 0.00024414062;
  DAT_006961a6 = (short)((uint)local_68 >> 0x10);
  _DAT_006962f0 = (float)DAT_006961a6 * 0.00024414062;
  DAT_006961a8 = (short)local_64;
  _DAT_006962f4 = (float)DAT_006961a8 * 0.00024414062;
  DAT_006961aa = (short)((uint)local_64 >> 0x10);
  _DAT_006962f8 = (float)DAT_006961aa * 0.00024414062;
  DAT_006961ac = (short)local_60;
  _DAT_00696300 = (float)DAT_006961ac * 0.00024414062;
  DAT_006961ae = (short)((uint)local_60 >> 0x10);
  _DAT_00696304 = (float)DAT_006961ae * 0.00024414062;
  DAT_006961b0 = (short)local_5c;
  _DAT_00696308 = (float)DAT_006961b0 * 0.00024414062;
  iVar15 = DAT_0060e328 * 0x90;
  iVar12 = (int)*(short *)(in_ECX + 8);
  iVar13 = (int)*(short *)(in_ECX + 10);
  iVar14 = (int)*(short *)(in_ECX + 0xc);
  iVar17 = *(int *)(*(int *)(DAT_00791594 + 0x18) + (uint)*(byte *)(in_ECX + 3) * 4);
  iVar4 = *(int *)(iVar17 + 0x40);
  local_30 = (ushort *)(DAT_00768da0 + (uint)*(ushort *)(iVar17 + 0x3c) * 2);
  uVar2 = *local_30;
  local_3c = (uint)*(ushort *)(iVar17 + 6);
  puVar22 = *(uint **)(iVar17 + 0xc);
  _DAT_006961a0 = uVar5;
  _DAT_006961ac = uVar6;
  _DAT_006961b0 = uVar7;
  if (local_3c != 0) {
    iVar17 = (int)DAT_006961aa;
    DAT_0060e328 = DAT_0060e328 + local_3c;
    iVar18 = (int)DAT_006961a6;
    _DAT_006961a4 = uVar9;
    _DAT_006961a8 = uVar10;
    local_8 = (int *)(&DAT_00766744 + iVar15);
    do {
      local_38 = (undefined1 *)((uint)uVar2 + iVar8);
      uVar21 = *puVar22;
      uVar19 = uVar21 & 0xff;
      iVar23 = (int)*(short *)(iVar4 + -6 + uVar19 * 8);
      iVar15 = (int)DAT_006961a2;
      iVar27 = (int)*(short *)(iVar4 + -4 + uVar19 * 8);
      iVar20 = (int)*(short *)(iVar4 + -8 + uVar19 * 8);
      iVar25 = (int)DAT_006961a0;
      iVar26 = (int)DAT_006961a4;
      iVar16 = (int)DAT_006961a8;
      local_8[2] = (short)(iVar23 * DAT_006961ae + iVar20 * DAT_006961ac + iVar27 * DAT_006961b0 >>
                          0xc) + iVar14 >> 4;
      *local_8 = (short)(iVar23 * iVar15 + iVar20 * iVar25 + iVar27 * iVar26 >> 0xc) + iVar12 >> 4;
      local_8[1] = (short)(iVar23 * iVar16 + iVar20 * iVar18 + iVar27 * iVar17 >> 0xc) + iVar13 >> 4
      ;
      uVar19 = uVar21 >> 8 & 0xff;
      iVar27 = (int)*(short *)(iVar4 + -4 + uVar19 * 8);
      iVar23 = (int)*(short *)(iVar4 + -6 + uVar19 * 8);
      iVar15 = (int)DAT_006961a2;
      iVar20 = (int)*(short *)(iVar4 + -8 + uVar19 * 8);
      iVar25 = (int)DAT_006961a0;
      iVar26 = (int)DAT_006961a4;
      iVar16 = (int)DAT_006961a8;
      local_8[5] = (short)(iVar23 * DAT_006961ae + iVar20 * DAT_006961ac + iVar27 * DAT_006961b0 >>
                          0xc) + iVar14 >> 4;
      local_8[3] = (short)(iVar23 * iVar15 + iVar20 * iVar25 + iVar27 * iVar26 >> 0xc) + iVar12 >> 4
      ;
      local_8[4] = (short)(iVar23 * iVar16 + iVar20 * iVar18 + iVar27 * iVar17 >> 0xc) + iVar13 >> 4
      ;
      uVar19 = uVar21 >> 0x10 & 0xff;
      iVar23 = (int)*(short *)(iVar4 + -6 + uVar19 * 8);
      iVar15 = (int)DAT_006961a2;
      iVar27 = (int)*(short *)(iVar4 + -4 + uVar19 * 8);
      iVar20 = (int)*(short *)(iVar4 + -8 + uVar19 * 8);
      iVar25 = (int)DAT_006961a0;
      iVar26 = (int)DAT_006961a4;
      iVar16 = (int)DAT_006961a8;
      local_8[8] = (short)(iVar23 * DAT_006961ae + iVar20 * DAT_006961ac + iVar27 * DAT_006961b0 >>
                          0xc) + iVar14 >> 4;
      local_8[6] = (short)(iVar23 * iVar15 + iVar20 * iVar25 + iVar27 * iVar26 >> 0xc) + iVar12 >> 4
      ;
      local_8[7] = (short)(iVar23 * iVar16 + iVar20 * iVar18 + iVar27 * iVar17 >> 0xc) + iVar13 >> 4
      ;
      uVar21 = uVar21 >> 0x18;
      sVar24 = *(short *)(iVar4 + -8 + uVar21 * 8);
      sVar11 = *(short *)(iVar4 + -6 + uVar21 * 8);
      sVar3 = *(short *)(iVar4 + -4 + uVar21 * 8);
      local_44 = CONCAT22(sVar11,sVar24);
      _DAT_00696224 = local_44;
      iVar20 = (int)sVar11;
      local_40 = CONCAT22((short)((uint)local_40 >> 0x10),sVar3);
      iVar23 = (int)sVar3;
      iVar15 = (int)sVar24;
      iVar16 = iVar20 * DAT_006961a2 + iVar15 * DAT_006961a0 + iVar23 * DAT_006961a4 >> 0xc;
      DAT_0069628c = iVar20 * DAT_006961a8 + iVar15 * iVar18 + iVar23 * iVar17 >> 0xc;
      DAT_00696290 = iVar20 * DAT_006961ae + iVar15 * DAT_006961ac + iVar23 * DAT_006961b0 >> 0xc;
      sVar24 = (short)DAT_0069628c;
      _DAT_00696228 = local_40;
      DAT_00696288 = iVar16;
      local_8[0xb] = (short)DAT_00696290 + iVar14 >> 4;
      local_8[10] = sVar24 + iVar13 >> 4;
      local_8[9] = (short)iVar16 + iVar12 >> 4;
      *(undefined2 *)((int)local_8 + 0x6e) = *(undefined2 *)(local_38 + 6);
      *(undefined1 *)(local_8 + 0x14) = local_38[4];
      *(undefined1 *)(local_8 + 0x1b) = local_38[10];
      *(undefined1 *)(local_8 + 0x22) = *local_38;
      *(undefined1 *)(local_8 + 0x29) = local_38[8];
      uVar1 = local_38[1];
      *(undefined1 *)((int)local_8 + 0x6d) = uVar1;
      *(undefined1 *)((int)local_8 + 0x51) = uVar1;
      uVar1 = local_38[5];
      *(undefined1 *)((int)local_8 + 0xa5) = uVar1;
      *(undefined1 *)((int)local_8 + 0x89) = uVar1;
      local_8[0xd] = 0xffffff;
      *(undefined1 *)((int)local_8 + 0x37) = 0x9a;
      *(undefined2 *)((int)local_8 + 0xe6) = *(undefined2 *)(local_38 + 6);
      *(undefined1 *)(local_8 + 0x32) = local_38[4];
      puVar22 = puVar22 + 2;
      *(undefined1 *)(local_8 + 0x39) = local_38[10];
      *(undefined1 *)(local_8 + 0x40) = *local_38;
      *(undefined1 *)(local_8 + 0x47) = local_38[8];
      uVar1 = local_38[1];
      *(undefined1 *)((int)local_8 + 0xe5) = uVar1;
      *(undefined1 *)((int)local_8 + 0xc9) = uVar1;
      uVar1 = local_38[5];
      *(undefined1 *)((int)local_8 + 0x11d) = uVar1;
      *(undefined1 *)((int)local_8 + 0x101) = uVar1;
      local_30 = local_30 + 1;
      local_8[0x2b] = 0xffffff;
      *(undefined1 *)((int)local_8 + 0xaf) = 0x9a;
      uVar2 = *local_30;
      local_3c = local_3c - 1;
      uVar9 = _DAT_006961a4;
      uVar10 = _DAT_006961a8;
      local_8 = local_8 + 0x48;
    } while (local_3c != 0);
  }
  _DAT_006961a8 = uVar10;
  _DAT_006961a4 = uVar9;
  return;
}

