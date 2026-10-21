FUNCTION 80061328 FUN_80061328

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_80061328(undefined4 param_1,undefined4 *param_2)

{
  ushort *puVar1;
  undefined2 uVar2;
  int iVar3;
  undefined4 uVar4;
  int iVar5;
  int iVar6;
  char *pcVar7;
  uint *puVar8;
  ushort uVar9;
  int iVar10;
  undefined1 *puVar11;
  undefined1 *puVar12;
  uint *puVar13;
  int *piVar14;
  ushort *puVar15;
  int iVar16;
  short *psVar17;
  int iVar18;
  int iVar19;
  int *piVar20;
  int iVar21;
  ushort *puVar22;
  short *psVar23;
  int iVar24;
  int iVar25;
  uint uVar26;
  ushort *puVar27;
  int unaff_gp;
  undefined4 local_68;
  undefined4 local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined2 local_58;
  undefined2 local_56;
  undefined2 local_54;
  undefined2 local_52;
  int local_50;
  int local_4c;
  int local_48;
  uint *local_40;
  int local_3c;
  int local_38;
  int local_34;
  int local_30;
  int local_2c;
  
  local_68 = DAT_800af4e8;
  local_64 = DAT_800af4ec;
  local_60 = DAT_800af4f0;
  local_5c = DAT_800af4f4;
  FUN_8001d718(0);
  iVar3 = FUN_80094194(*(undefined2 *)(DAT_800af120 + 0x23a),0,0);
  FUN_8001d718(0);
  local_58 = 0x200;
  local_56 = 0;
  local_54 = 0x200;
  local_52 = 0x200;
  FUN_80096480(&local_58,0,0,0);
  FUN_80096510(&local_68,iVar3 + 0x10);
  FUN_800962fc(0);
  FUN_80096510(&local_60,iVar3 + 0x80010);
  FUN_800962fc(0);
  FUN_8001eebc(iVar3);
  FUN_8001d718(0);
  uVar4 = FUN_80094194(*(undefined2 *)(DAT_800af120 + 0x23c),0,0);
  *(undefined4 *)(unaff_gp + 0xa40) = uVar4;
  *(undefined4 *)(unaff_gp + 0xa50) = uVar4;
  FUN_8001d718(0);
  FUN_8005f190((int)*(short *)(*(int *)(unaff_gp + 0xa50) + 0x11e));
  FUN_8001d718(0);
  local_40 = (uint *)0x0;
  if ((*(ushort *)(*(int *)(unaff_gp + 0xa50) + 4) & 8) == 0) {
    *(undefined4 *)(unaff_gp + 0xa1c) = 0;
  }
  else {
    *(undefined4 *)(unaff_gp + 0xa1c) = 1;
  }
  _DAT_800af9cc = *(undefined4 *)(*(int *)(unaff_gp + 0xa50) + 0x54);
  _DAT_800bcb34 = (uint)*(uint3 *)(unaff_gp + 0xa28);
  iVar21 = *(int *)(*(int *)(unaff_gp + 0xa50) + 8);
  iVar24 = 0;
  iVar5 = FUN_8001f02c(iVar21 * 0x68);
  iVar3 = FUN_8001f02c(0x1dc40);
  *(int *)(unaff_gp + 0x53c) = iVar3;
  *(int *)(unaff_gp + 0xa58) = iVar3 + 0xee20;
  *(int *)(unaff_gp + 0xa54) = iVar3 + 0xedec;
  *(int *)(unaff_gp + 0xa5c) = iVar3 + 0x1dc0c;
  FUN_8001d718(0);
  iVar16 = *(int *)(unaff_gp + 0xa50);
  iVar6 = *(int *)(unaff_gp + 0xa40);
  local_34 = iVar6 + *(int *)(iVar16 + 0x88);
  local_30 = iVar6 + *(int *)(iVar16 + 0x8c);
  iVar6 = iVar6 + *(int *)(iVar16 + 0x98);
  iVar3 = local_30;
  if (*(char *)(iVar16 + 0x79) != '\0') {
    do {
      iVar24 = iVar24 + 1;
      *(int *)(iVar3 + 8) = iVar6 + *(int *)(iVar3 + 8);
      iVar3 = iVar3 + 0xc;
    } while (iVar24 < (int)(uint)*(byte *)(iVar16 + 0x79));
  }
  iVar3 = *(int *)(unaff_gp + 0xa50);
  local_38 = *(int *)(unaff_gp + 0xa40);
  *(undefined4 **)(unaff_gp + 0xa2c) = param_2;
  *(int *)(iVar3 + 0x14) = local_38 + *(int *)(iVar3 + 0x14);
  *(int *)(iVar3 + 0x7c) = local_38 + *(int *)(iVar3 + 0x7c);
  *(int *)(iVar3 + 0x80) = local_38 + *(int *)(iVar3 + 0x80);
  *(int *)(iVar3 + 0x18) = local_38 + *(int *)(iVar3 + 0x18);
  *(int *)(iVar3 + 0x34) = local_38 + *(int *)(iVar3 + 0x34);
  *(int *)(iVar3 + 0x40) = local_38 + *(int *)(iVar3 + 0x40);
  *(int *)(iVar3 + 0x3c) = local_38 + *(int *)(iVar3 + 0x3c);
  iVar16 = *(int *)(iVar3 + 0x20);
  iVar24 = local_38 + *(int *)(iVar3 + 0x4c);
  *(int *)(iVar3 + 0x4c) = iVar24;
  *(int *)(unaff_gp + 0xa44) = iVar24;
  psVar17 = (short *)(local_38 + *(int *)(iVar3 + 0x24));
  *(int *)(iVar3 + 0x20) = local_38 + iVar16;
  *(short **)(iVar3 + 0x24) = psVar17;
  iVar3 = *(int *)(iVar3 + 0x1c);
  param_2[5] = psVar17;
  local_38 = local_38 + iVar3;
  FUN_8001d718(0);
  iVar25 = 0;
  iVar3 = *(int *)(unaff_gp + 0xa50);
  iVar24 = *(int *)(unaff_gp + 0xa40);
  *(int *)(iVar3 + 0x6c) = iVar24 + *(int *)(iVar3 + 0x6c);
  local_2c = iVar24 + *(int *)(iVar3 + 0x68);
  *(int *)(iVar3 + 0xa8) = iVar24 + *(int *)(iVar3 + 0xa8);
  *(int *)(iVar3 + 0x70) = iVar24 + *(int *)(iVar3 + 0x70);
  *(int *)(iVar3 + 0x9c) = iVar24 + *(int *)(iVar3 + 0x9c);
  *(int *)(iVar3 + 0xa4) = iVar24 + *(int *)(iVar3 + 0xa4);
  *(int *)(iVar3 + 0x74) = iVar24 + *(int *)(iVar3 + 0x74);
  *(int *)(iVar3 + 0x44) = iVar24 + *(int *)(iVar3 + 0x44);
  *(int *)(iVar3 + 0xe4) = iVar24 + *(int *)(iVar3 + 0xe4);
  *(int *)(iVar3 + 0xf0) = iVar24 + *(int *)(iVar3 + 0xf0);
  *(int *)(iVar3 + 0x100) = iVar24 + *(int *)(iVar3 + 0x100);
  *(int *)(iVar3 + 0xf8) = iVar24 + *(int *)(iVar3 + 0xf8);
  *(int *)(iVar3 + 0xd4) = iVar24 + *(int *)(iVar3 + 0xd4);
  *(int *)(iVar3 + 0x118) = iVar24 + *(int *)(iVar3 + 0x118);
  *(int *)(iVar3 + 0x90) = iVar24 + *(int *)(iVar3 + 0x90);
  *(int *)(iVar3 + 0xc0) = iVar24 + *(int *)(iVar3 + 0xc0);
  *(int *)(iVar3 + 0xec) = iVar24 + *(int *)(iVar3 + 0xec);
  *(int *)(iVar3 + 0x108) = iVar24 + *(int *)(iVar3 + 0x108);
  *(int *)(iVar3 + 0x10c) = iVar24 + *(int *)(iVar3 + 0x10c);
  *(int *)(iVar3 + 0x130) = iVar24 + *(int *)(iVar3 + 0x130);
  *(int *)(iVar3 + 0x124) = iVar24 + *(int *)(iVar3 + 0x124);
  *(int *)(iVar3 + 300) = iVar24 + *(int *)(iVar3 + 300);
  *(int *)(iVar3 + 0x104) = iVar24 + *(int *)(iVar3 + 0x104);
  *(int *)(iVar3 + 0x120) = iVar24 + *(int *)(iVar3 + 0x120);
  *(int *)(iVar3 + 0xd0) = iVar24 + *(int *)(iVar3 + 0xd0);
  iVar16 = *(int *)(iVar3 + 0xc4);
  if (*(short *)(iVar3 + 0x2c) != 0) {
    do {
      iVar19 = *(int *)(unaff_gp + 0xa50);
      piVar14 = (int *)(iVar25 * 4 + *(int *)(iVar19 + 0x18));
      iVar3 = *piVar14;
      if (iVar3 != 0) {
        *piVar14 = *(int *)(unaff_gp + 0xa40) + iVar3;
        FUN_80062948(*(undefined4 *)(iVar25 * 4 + *(int *)(iVar19 + 0x18)));
      }
      iVar25 = iVar25 + 1;
    } while (iVar25 < (int)(uint)*(ushort *)(*(int *)(unaff_gp + 0xa50) + 0x2c));
  }
  FUN_8001d718(0);
  iVar3 = *(int *)(unaff_gp + 0xa50);
  uVar26 = (uint)*(ushort *)(iVar3 + 0x2c);
  iVar25 = *(int *)(unaff_gp + 0xa40);
  do {
    piVar14 = (int *)(uVar26 * 4 + *(int *)(iVar3 + 0x18));
    *piVar14 = iVar25 + *piVar14;
    uVar26 = uVar26 + 1;
  } while ((int)uVar26 < (int)(*(ushort *)(iVar3 + 0x2c) + 5));
  iVar3 = *(int *)(unaff_gp + 0xa50);
  piVar14 = *(int **)(iVar3 + 0x14);
  *(undefined2 *)(param_2 + 0x2a) = 0;
  iVar25 = 0;
  if (0 < *(int *)(iVar3 + 0x10)) {
    iVar19 = *(int *)(unaff_gp + 0xa40);
    piVar20 = piVar14;
    do {
      iVar18 = 0;
      iVar10 = iVar19 + *piVar20;
      *piVar20 = iVar10;
      *(int *)(iVar10 + 0x50) = iVar19 + *(int *)(iVar10 + 0x50);
      do {
        iVar10 = iVar18 * 4;
        *(int *)(*piVar20 + iVar10 + 0x54) = iVar19 + *(int *)(*piVar20 + iVar10 + 0x54);
        *(int *)(*piVar20 + iVar10 + 0x28) = iVar19 + *(int *)(*piVar20 + iVar10 + 0x28);
        iVar18 = iVar18 + 1;
        *(int *)(*piVar20 + iVar10 + 0x3c) = iVar19 + *(int *)(*piVar20 + iVar10 + 0x3c);
      } while (iVar18 < 3);
      *(int *)(*piVar20 + 0x20) = iVar19 + *(int *)(*piVar20 + 0x20);
      *(int *)(*piVar20 + 0x48) = *(int *)(iVar3 + 0x3c) + *(int *)(*piVar20 + 0x48);
      *(int *)(*piVar20 + 0x38) = iVar19 + *(int *)(*piVar20 + 0x38) + *(int *)(iVar3 + 0x50);
      iVar25 = iVar25 + 1;
      *(int *)(*piVar20 + 0x4c) = iVar24 + iVar16 + *(int *)(*piVar20 + 0x4c) * 0x1c;
      piVar20 = piVar20 + 1;
    } while (iVar25 < *(int *)(iVar3 + 0x10));
  }
  FUN_8001d718(0);
  iVar16 = 0;
  iVar3 = *(int *)(unaff_gp + 0xa50);
  do {
    if (*psVar17 != 0xff) {
      *(int *)(psVar17 + 6) = *(int *)(iVar3 + 0x6c) + *(int *)(psVar17 + 6) * 2 + -2;
    }
    iVar16 = iVar16 + 1;
    psVar17 = psVar17 + 8;
  } while (iVar16 < 0x100);
  FUN_8001d718(0);
  iVar3 = 0;
  *(int *)(*(int *)(unaff_gp + 0xa50) + 0x28) =
       *(int *)(unaff_gp + 0xa40) + *(int *)(*(int *)(unaff_gp + 0xa50) + 0x28);
  if (0 < iVar21) {
    puVar11 = (undefined1 *)(iVar5 + 0x5e);
    do {
      puVar11[-0x5b] = 0xc;
      puVar11[-0x57] = 0x3c;
      puVar11[-0x5a] = 0x80;
      puVar11[-0x59] = 0x80;
      puVar11[-0x58] = 0x80;
      puVar11[-0x4e] = 0x80;
      puVar11[-0x4d] = 0x80;
      puVar11[-0x4c] = 0x80;
      puVar11[-0x42] = 0x80;
      puVar11[-0x41] = 0x80;
      puVar11[-0x40] = 0x80;
      puVar11[-0x36] = 0x80;
      puVar11[-0x35] = 0x80;
      puVar11[-0x34] = 0x80;
      puVar11[-0x27] = 0xc;
      puVar11[-0x23] = 0x3c;
      puVar11[-0x26] = 0x80;
      puVar11[-0x25] = 0x80;
      puVar11[-0x24] = 0x80;
      puVar11[-0x1a] = 0x80;
      puVar11[-0x19] = 0x80;
      puVar11[-0x18] = 0x80;
      puVar11[-0xe] = 0x80;
      puVar11[-0xd] = 0x80;
      puVar11[-0xc] = 0x80;
      puVar11[-2] = 0x80;
      puVar11[-1] = 0x80;
      *puVar11 = 0x80;
      iVar3 = iVar3 + 1;
      puVar11 = puVar11 + 0x68;
    } while (iVar3 < iVar21);
  }
  FUN_8001d718(0);
  iVar3 = *(int *)(unaff_gp + 0xa50);
  iVar16 = *(int *)(unaff_gp + 0xa40);
  *(int *)(iVar3 + 0x60) = iVar16 + *(int *)(iVar3 + 0x60);
  *(int *)(iVar3 + 0x84) = iVar16 + *(int *)(iVar3 + 0x84);
  FUN_800585c0(*(undefined4 *)(iVar3 + 0x60),*(undefined2 *)(iVar3 + 100));
  iVar24 = 0;
  FUN_800586d8(*(undefined2 *)(*(int *)(unaff_gp + 0xa50) + 0x5c),
               *(undefined2 *)(*(int *)(unaff_gp + 0xa50) + 0x5e));
  iVar3 = FUN_80094194(*(undefined2 *)(DAT_800af120 + 0x23e),0,0);
  FUN_8001d718(0);
  puVar27 = (ushort *)(iVar3 + *(int *)(iVar3 + 0x28));
  *(undefined4 *)(unaff_gp + 0xa60) = *(undefined4 *)(iVar3 + 0x10);
  iVar16 = *(int *)(*(int *)(unaff_gp + 0xa50) + 0x114);
  *(int *)(unaff_gp + 0xa3c) =
       *(int *)(unaff_gp + 0xa40) + *(int *)(*(int *)(unaff_gp + 0xa50) + 0x110);
  *(int *)(unaff_gp + 0xa48) = *(int *)(unaff_gp + 0xa40) + iVar16;
  pcVar7 = (char *)(iVar3 + 0x40);
  if (0 < iVar21) {
    puVar11 = (undefined1 *)(iVar5 + 0x65);
    do {
      puVar12 = *(undefined1 **)(unaff_gp + 0xa3c);
      *(ushort *)(puVar11 + -0x4b) = *(ushort *)(puVar12 + 6) | 0x20;
      puVar11[-0x52] = *pcVar7 - 1U & 0x1f;
      *(ushort *)(puVar11 + -0x57) = *(ushort *)(puVar12 + 2) & 0x7fff;
      puVar11[-0x59] = *puVar12;
      puVar11[-0x58] = puVar12[1];
      puVar11[-0x4d] = puVar12[4];
      puVar11[-0x4c] = puVar12[5];
      puVar11[-0x41] = puVar12[8];
      puVar11[-0x40] = puVar12[9];
      puVar11[-0x35] = puVar12[10];
      puVar11[-0x34] = puVar12[0xb];
      *(ushort *)(puVar11 + -0x17) = *(ushort *)(puVar12 + 6) | 0x20;
      puVar11[-0x1e] = *pcVar7 - 1U & 0x1f;
      *(ushort *)(puVar11 + -0x23) = *(ushort *)(puVar12 + 2) & 0x7fff;
      puVar11[-0x25] = *puVar12;
      puVar11[-0x24] = puVar12[1];
      puVar11[-0x19] = puVar12[4];
      puVar11[-0x18] = puVar12[5];
      puVar11[-0xd] = puVar12[8];
      puVar11[-0xc] = puVar12[9];
      iVar24 = iVar24 + 1;
      puVar11[-1] = puVar12[10];
      pcVar7 = pcVar7 + 2;
      *puVar11 = puVar12[0xb];
      puVar11 = puVar11 + 0x68;
    } while (iVar24 < iVar21);
  }
  FUN_8001d718(0);
  FUN_800587b4(iVar3);
  local_3c = *(int *)(iVar3 + 0x14);
  iVar16 = *(int *)(unaff_gp + 0xa50);
  param_2[1] = iVar5;
  *param_2 = piVar14;
  param_2[2] = iVar16;
  *(undefined1 *)((int)param_2 + 0x45) = *(undefined1 *)(iVar16 + 4);
  iVar5 = *(int *)(unaff_gp + 0xa50);
  param_2[3] = *(undefined4 *)(iVar5 + 0x20);
  param_2[4] = *(undefined4 *)(iVar5 + 0x10);
  param_2[6] = *(undefined4 *)(iVar5 + 0x18);
  param_2[7] = *(undefined4 *)(iVar5 + 0x34);
  param_2[8] = *(undefined4 *)(iVar5 + 0x38);
  param_2[9] = *(undefined4 *)(iVar5 + 0x40);
  param_2[10] = *(undefined4 *)(iVar5 + 0x48);
  param_2[0x13] = *(undefined4 *)(iVar5 + 0x70);
  *(undefined1 *)((int)param_2 + 0x47) = *(undefined1 *)(iVar5 + 0x78);
  iVar5 = *(int *)(unaff_gp + 0xa50);
  param_2[0xb] = *(undefined4 *)(iVar5 + 0x44);
  param_2[0x12] = *(undefined4 *)(iVar5 + 0x74);
  param_2[0xc] = *(undefined4 *)(iVar5 + 0x4c);
  param_2[0x14] = *(undefined4 *)(iVar5 + 0x7c);
  param_2[0x15] = *(undefined4 *)(iVar5 + 0x80);
  uVar4 = *(undefined4 *)(iVar5 + 0x84);
  param_2[0xe] = local_2c;
  param_2[0x16] = uVar4;
  param_2[0xf] = *(undefined4 *)(iVar5 + 0x6c);
  *(undefined2 *)(param_2 + 0x17) = *(undefined2 *)(iVar5 + 0x66);
  uVar2 = *(undefined2 *)(iVar5 + 0x7a);
  param_2[0x18] = local_30;
  param_2[0x19] = iVar6;
  *(undefined2 *)((int)param_2 + 0x5e) = uVar2;
  param_2[0x25] = *(undefined4 *)(iVar5 + 0xc0);
  *(undefined1 *)((int)param_2 + 0x46) = *(undefined1 *)(iVar5 + 0x79);
  *(undefined1 *)((int)param_2 + 0x36) = *(undefined1 *)(*(int *)(unaff_gp + 0xa50) + 0x94);
  iVar5 = *(int *)(unaff_gp + 0xa50);
  param_2[0x1a] = *(undefined4 *)(iVar5 + 0x90);
  param_2[0x1e] = *(undefined4 *)(iVar5 + 0xa8);
  param_2[0x1b] = *(undefined4 *)(iVar5 + 0x9c);
  param_2[0x1d] = *(undefined4 *)(iVar5 + 0xa4);
  *(undefined1 *)(param_2 + 0x11) = *(undefined1 *)(iVar5 + 0x95);
  iVar5 = *(int *)(unaff_gp + 0xa50);
  iVar6 = *(int *)(unaff_gp + 0xa40);
  param_2[0x1c] = iVar6 + *(int *)(iVar5 + 0xa0);
  param_2[0x24] = iVar6 + *(int *)(iVar5 + 0xbc);
  param_2[0x1f] = iVar6 + *(int *)(iVar5 + 0xac);
  param_2[0x20] = *(undefined4 *)(iVar5 + 0x28);
  param_2[0x21] = iVar6 + *(int *)(iVar5 + 0xb0);
  param_2[0x23] = iVar6 + *(int *)(iVar5 + 0xb8);
  param_2[0x22] = (uint)*(byte *)(iVar5 + 0xb4);
  param_2[0x27] = iVar6 + *(int *)(iVar5 + 0xd8);
  param_2[0x10] = iVar6 + *(int *)(iVar5 + 0xcc);
  FUN_8001d718(0);
  iVar6 = 0;
  iVar5 = DAT_800af120;
  if (*(char *)(DAT_800af120 + 0x213) != '\0') {
    do {
      FUN_8006261c(iVar6,*(undefined1 *)(iVar5 + 0x12));
      FUN_8001d718(0);
      iVar6 = iVar6 + 1;
      iVar5 = DAT_800af120 + iVar6;
    } while (iVar6 < (int)(uint)*(byte *)(DAT_800af120 + 0x213));
  }
  iVar5 = FUN_8001f02c(local_3c << 2);
  iVar6 = 0;
  _DAT_800af964 = 0;
  *(undefined4 *)(unaff_gp + 0xa4c) = 0;
  if (0 < local_3c) {
    puVar22 = puVar27 + 0xf;
    do {
      uVar9 = *puVar27 & 0x3ff;
      if (uVar9 == 2) {
        FUN_80053fc4((int)(short)puVar22[-0xb],(int)(short)puVar22[-10],(int)(short)puVar22[-9],
                     puVar22[-0xc],(char)puVar22[-0xd],*(undefined1 *)((int)puVar22 + -0x19));
      }
      else if (uVar9 < 3) {
        if ((*puVar27 & 0x3ff) == 0) {
          puVar8 = (uint *)FUN_8005f290(*(undefined4 *)
                                         ((uint)*(byte *)((int)puVar22 + -0x1b) * 4 +
                                         *(int *)(*(int *)(unaff_gp + 0xa50) + 0x18)),*puVar27,0x198
                                       );
          iVar16 = 0;
          *(char *)((int)puVar8 + 0x14d) = (char)puVar22[4];
          *(byte *)((int)puVar8 + 0x186) = (byte)(puVar22[-4] >> 8) & 1;
          *(ushort *)(puVar8 + 0x61) = puVar22[5];
          puVar13 = puVar8;
          puVar15 = puVar27;
          do {
            puVar1 = puVar15 + 0x10;
            puVar15 = puVar15 + 1;
            iVar16 = iVar16 + 1;
            puVar13[0x59] = local_38 + (uint)*puVar1;
            puVar13 = puVar13 + 1;
          } while (iVar16 < 3);
          puVar8[99] = 3;
          puVar8[100] = 3;
          *(char *)((int)puVar8 + 0x18a) = (char)puVar22[-1];
          *(undefined1 *)((int)puVar8 + 0x18b) = *(undefined1 *)((int)puVar22 + -1);
          *(ushort *)(puVar8 + 0x5c) = puVar22[-2];
          *(ushort *)((int)puVar8 + 0x172) = puVar22[-3];
          *(char *)((int)puVar8 + 0x17d) = (char)(puVar22[-7] >> 4);
          *(ushort *)(puVar8 + 0x5d) = puVar22[-0xc];
          *(undefined1 *)((int)puVar8 + 0x17e) = *(undefined1 *)((int)puVar22 + 1);
          if (puVar22[-0xc] == 0xffff) {
            *(undefined1 *)(puVar8 + 0x5f) = 0;
          }
          else {
            puVar8[0x65] = 0;
            if ((char)puVar22[-4] == '\0') {
              puVar8[0x60] = 0;
            }
            else {
              puVar8[0x60] = (uint)local_40;
              *(undefined1 *)(local_40 + 0x5f) = 0;
              local_40[0x65] = (uint)puVar8;
            }
            *(undefined1 *)(puVar8 + 0x5f) =
                 *(undefined1 *)
                  ((uint)puVar22[-0xc] * 0x10 + *(int *)(*(int *)(unaff_gp + 0xa50) + 0x80) + 7);
            local_40 = puVar8;
          }
          *(short *)((int)puVar8 + 0x176) = (short)iVar6;
          *(uint **)(iVar6 * 4 + iVar5) = puVar8;
          puVar8[0x5e] = local_34 + (uint)puVar22[-5] * 4;
          FUN_80098ae8(puVar8 + 0xc,0,200);
          FUN_80028b94((int)(short)puVar22[-8],(int)(short)puVar22[-7],(int)(short)puVar22[-6],
                       puVar8 + 0x15);
          FUN_800288b4(puVar8 + 0x15,puVar8 + 0x2c);
          puVar8[0xc] = (int)(short)puVar22[-0xb] << 0x10;
          puVar8[0xd] = (int)(short)puVar22[-10] << 0x10;
          puVar8[0xe] = (int)(short)puVar22[-9] << 0x10;
          *(byte *)((int)puVar8 + 0x14e) = (byte)(puVar22[-4] >> 9) & 0x3c;
          if ((puVar22[-4] & 0x8000) != 0) {
            FUN_800612d4(puVar8);
          }
          FUN_800680a8(puVar8,puVar27,&DAT_800af4e4);
          FUN_80048798(puVar8);
          if (*(char *)((int)puVar8 + 0x17e) == '\x02') {
            FUN_800635ec(puVar8,puVar27);
          }
          else if (*(char *)((int)puVar8 + 0x17e) == '\x16') {
            uVar26 = DAT_800af1bc * 0x41a7 & 0x7fffffff;
            iVar16 = _DAT_800af964 * 8;
            DAT_800af1bc = uVar26;
            _DAT_800af964 = _DAT_800af964 + 1;
            *(char *)(iVar16 + -0x7ff4496c) = (char)(uVar26 >> 0x10);
            *(uint **)(iVar16 + -0x7ff44970) = puVar8;
            *(byte *)(iVar16 + -0x7ff4496b) = ((byte)(uVar26 >> 0x18) & 1) + 1;
            *puVar8 = *puVar8 | 0x100000;
          }
          FUN_800808b8(puVar8);
          if (*(char *)((int)puVar8 + 0x17e) == '\0') {
            FUN_80038320(puVar8);
          }
        }
      }
      else if (uVar9 == 0xd) {
        FUN_8005406c((int)(short)puVar22[-0xb],(int)(short)puVar22[-10],(int)(short)puVar22[-9],
                     puVar22[-0xc],(char)puVar22[-0xd],(char)puVar22[-1],
                     *(undefined1 *)((int)puVar22 + -1),(char)*puVar22,
                     *(undefined4 *)(unaff_gp + 0x540));
        *(int *)(unaff_gp + 0x540) = *(int *)(unaff_gp + 0x540) + 1;
      }
      else if ((uVar9 == 0x18) && (iVar16 = FUN_800367fc(puVar27), iVar16 != 0)) {
        FUN_800680a8(iVar16,puVar27,&DAT_800af4e4);
        FUN_800382ac(puVar27,iVar16);
      }
      puVar22 = puVar22 + 0x20;
      iVar6 = iVar6 + 1;
      puVar27 = puVar27 + 0x20;
    } while (iVar6 < local_3c);
  }
  iVar6 = *(int *)(unaff_gp + 0xa50);
  iVar16 = 0;
  if (*(short *)(iVar6 + 0x96) != 0) {
    do {
      puVar13 = (uint *)(iVar16 * 4 + param_2[0x1f]);
      uVar26 = *puVar13;
      if (uVar26 < 0x10000) {
        *puVar13 = *(uint *)(uVar26 * 4 + iVar5);
      }
      iVar16 = iVar16 + 1;
    } while (iVar16 < (int)(uint)*(ushort *)(iVar6 + 0x96));
    iVar6 = *(int *)(unaff_gp + 0xa50);
  }
  iVar16 = 0;
  if (*(char *)(iVar6 + 0x12a) != '\0') {
    do {
      iVar6 = iVar16 * 8 + *(int *)(iVar6 + 0x130);
      if (*(int *)(iVar6 + 4) == -1) {
        *(undefined4 *)(iVar6 + 4) = 0;
      }
      else {
        *(undefined4 *)(iVar6 + 4) = *(undefined4 *)(*(int *)(iVar6 + 4) * 4 + iVar5);
      }
      iVar6 = *(int *)(unaff_gp + 0xa50);
      iVar16 = iVar16 + 1;
    } while (iVar16 < (int)(uint)*(byte *)(iVar6 + 0x12a));
  }
  FUN_8001eebc(iVar5);
  FUN_8001eebc(iVar3);
  if (*(int *)(unaff_gp + 0xa1c) != 0) {
    iVar3 = *(int *)(*(int *)(unaff_gp + 0xa50) + 8);
    *(int *)(unaff_gp + 0xa20) = iVar3;
    uVar4 = FUN_8001f02c(iVar3 << 5);
    *(undefined4 *)(unaff_gp + 0xa24) = uVar4;
  }
  puVar13 = (uint *)&DAT_800b88a4;
  DAT_800af194 = 0;
  psVar17 = *(short **)(*(int *)(unaff_gp + 0xa50) + 0xf0);
  iVar3 = 0;
  if (*(char *)(*(int *)(unaff_gp + 0xa50) + 0xb6) != '\0') {
    psVar23 = psVar17 + 6;
    piVar14 = (int *)&DAT_800b88c0;
    do {
      if ((*(byte *)(psVar23 + -3) != 1) && (DAT_800af194 < 0x14)) {
        *puVar13 = (uint)*(byte *)(psVar23 + -3);
        piVar14[-6] = (int)*psVar17 << 0x10;
        piVar14[-5] = (int)psVar23[-5] << 0x10;
        piVar14[-4] = (int)psVar23[-4] << 0x10;
        piVar14[-3] = (int)psVar23[-2] << 0x10;
        piVar14[-2] = (int)psVar23[-1] << 0x10;
        piVar14[-1] = (int)*psVar23 << 0x10;
        if (*puVar13 == 2) {
          local_50 = piVar14[-3] - piVar14[-6] >> 8;
          local_4c = piVar14[-2] - piVar14[-5] >> 8;
          local_48 = piVar14[-1] - piVar14[-4] >> 8;
          FUN_80028e78(&local_50);
          *piVar14 = local_50;
          piVar14[1] = local_4c;
          piVar14[2] = local_48;
        }
        piVar14 = piVar14 + 0xb;
        puVar13 = puVar13 + 0xb;
        DAT_800af194 = DAT_800af194 + 1;
      }
      psVar23 = psVar23 + 8;
      iVar3 = iVar3 + 1;
      psVar17 = psVar17 + 8;
    } while (iVar3 < (int)(uint)*(byte *)(*(int *)(unaff_gp + 0xa50) + 0xb6));
  }
  iVar3 = 0;
  FUN_8004f244();
  if (*(short *)(*(int *)(unaff_gp + 0xa50) + 0x2c) != 0) {
    do {
      iVar3 = iVar3 + 1;
    } while (iVar3 < (int)(uint)*(ushort *)(*(int *)(unaff_gp + 0xa50) + 0x2c));
  }
  return 1;
}


FUNCTION 800587b4 FUN_800587b4

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_800587b4(int param_1)

{
  undefined4 *puVar1;
  undefined2 uVar2;
  ushort uVar3;
  int iVar4;
  undefined4 uVar5;
  undefined4 *puVar6;
  undefined1 *puVar7;
  undefined4 *puVar8;
  undefined4 *puVar9;
  uint uVar10;
  undefined4 *puVar11;
  uint uVar12;
  undefined4 *puVar13;
  int iVar14;
  
  if ((_DAT_800bb33c == 1) || (_DAT_800bb33c == 3)) {
    uVar12 = 0;
    puVar13 = (undefined4 *)(param_1 + *(int *)(param_1 + 0x1c));
    if (_DAT_800bb3b8 != 0) {
      puVar7 = (undefined1 *)(_DAT_800bb39c + 7);
      puVar8 = _DAT_800bb3b4;
      do {
        uVar10 = 0;
        puVar6 = puVar13;
        puVar9 = puVar8;
        do {
          uVar2 = *(undefined2 *)puVar6;
          puVar11 = puVar6 + 1;
          puVar6 = puVar6 + 2;
          uVar10 = uVar10 + 1;
          *puVar9 = CONCAT22(*(undefined2 *)puVar11,uVar2);
          iVar14 = _DAT_800af9e0;
          puVar9 = puVar9 + 1;
        } while (uVar10 < 4);
        uVar3 = *(ushort *)(puVar13 + 8);
        *(undefined4 *)(puVar7 + -3) = 0x80808080;
        puVar6 = (undefined4 *)(iVar14 + (uint)uVar3 * 0x10);
        *(undefined4 *)(puVar7 + 5) = *puVar6;
        uVar12 = uVar12 + 1;
        *(undefined4 *)(puVar7 + 0xd) = puVar6[1];
        puVar8 = puVar8 + 4;
        *(undefined2 *)(puVar7 + 0x15) = *(undefined2 *)(puVar6 + 2);
        uVar2 = *(undefined2 *)((int)puVar6 + 10);
        puVar13 = puVar13 + 9;
        puVar7[-4] = 9;
        *puVar7 = 0x2c;
        *(undefined2 *)(puVar7 + 0x1d) = uVar2;
        puVar7 = puVar7 + 0x28;
      } while (uVar12 < _DAT_800bb3b8);
    }
    uVar12 = _DAT_800bb3b8 * 10;
    uVar10 = 0;
    puVar8 = _DAT_800bb3a4;
    puVar6 = _DAT_800bb3a0;
    if (uVar12 != 0) {
      do {
        uVar10 = uVar10 + 1;
        uVar5 = *puVar6;
        puVar6 = puVar6 + 1;
        *puVar8 = uVar5;
        puVar8 = puVar8 + 1;
      } while (uVar10 < uVar12);
    }
    uVar12 = 0;
    if (_DAT_800bb3c0 != 0) {
      puVar7 = (undefined1 *)(_DAT_800bb3a8 + 7);
      puVar8 = _DAT_800bb3bc;
      iVar14 = _DAT_800bb3a8;
      do {
        uVar10 = 0;
        puVar6 = puVar13;
        puVar9 = puVar8;
        puVar11 = puVar8;
        do {
          uVar10 = uVar10 + 1;
          *puVar9 = *puVar6;
          puVar9 = puVar9 + 1;
          puVar1 = puVar6 + 1;
          puVar6 = puVar6 + 2;
          *(undefined2 *)(puVar11 + 4) = *(undefined2 *)puVar1;
          iVar4 = _DAT_800af9e0;
          puVar11 = (undefined4 *)((int)puVar11 + 2);
        } while (uVar10 < 4);
        uVar12 = uVar12 + 1;
        puVar8 = puVar8 + 6;
        uVar3 = *(ushort *)(puVar13 + 8);
        puVar13 = puVar13 + 9;
        *(undefined4 *)(puVar7 + -3) = 0x40404040;
        puVar6 = (undefined4 *)(iVar4 + (uint)uVar3 * 0x10);
        *(undefined4 *)(puVar7 + 5) = *puVar6;
        *(undefined4 *)(puVar7 + 0xd) = puVar6[1];
        *(undefined2 *)(puVar7 + 0x15) = *(undefined2 *)(puVar6 + 2);
        uVar2 = *(undefined2 *)((int)puVar6 + 10);
        puVar7[-4] = 9;
        *puVar7 = 0x2c;
        *(undefined2 *)(puVar7 + 0x1d) = uVar2;
        FUN_8009932c(iVar14,1);
        puVar7 = puVar7 + 0x28;
        iVar14 = iVar14 + 0x28;
      } while (uVar12 < _DAT_800bb3c0);
    }
    uVar12 = _DAT_800bb3c0 * 10;
    uVar10 = 0;
    puVar13 = _DAT_800bb3b0;
    puVar8 = _DAT_800bb3ac;
    if (uVar12 != 0) {
      do {
        uVar10 = uVar10 + 1;
        uVar5 = *puVar8;
        puVar8 = puVar8 + 1;
        *puVar13 = uVar5;
        puVar13 = puVar13 + 1;
      } while (uVar10 < uVar12);
    }
  }
  return;
}


FUNCTION 80062948 FUN_80062948

void FUN_80062948(int *param_1)

{
  uint uVar1;
  int iVar2;
  
  if ((*param_1 == 0x4d4f4401) || (*param_1 == 0x4d4f4301)) {
    param_1[6] = param_1[6] + (int)param_1;
    param_1[3] = param_1[3] + (int)param_1;
    param_1[0x11] = param_1[0x11] + (int)param_1;
    if (param_1[0x12] != 0) {
      param_1[0x12] = param_1[0x12] + (int)param_1;
    }
    uVar1 = (uint)*(ushort *)(param_1 + 7);
    if (uVar1 != 0) {
      *(uint *)((int)param_1 + uVar1 + 0x18) =
           (int)param_1 + *(int *)((int)param_1 + uVar1 + 0x18) + uVar1;
      iVar2 = *(int *)((int)param_1 + uVar1 + 0x48);
      *(uint *)((int)param_1 + uVar1 + 0xc) =
           (int)param_1 + *(int *)((int)param_1 + uVar1 + 0xc) + uVar1;
      if (iVar2 != 0) {
        *(uint *)((int)param_1 + uVar1 + 0x48) = (int)param_1 + iVar2 + uVar1;
      }
    }
    uVar1 = (uint)*(ushort *)((int)param_1 + 0x1e);
    if (uVar1 != 0) {
      *(uint *)((int)param_1 + uVar1 + 0x18) =
           (int)param_1 + *(int *)((int)param_1 + uVar1 + 0x18) + uVar1;
      iVar2 = *(int *)((int)param_1 + uVar1 + 0x48);
      *(uint *)((int)param_1 + uVar1 + 0xc) =
           (int)param_1 + *(int *)((int)param_1 + uVar1 + 0xc) + uVar1;
      if (iVar2 != 0) {
        *(uint *)((int)param_1 + uVar1 + 0x48) = (int)param_1 + iVar2 + uVar1;
      }
    }
    if ((param_1[0x15] & 0xffff0000U) == 0xface0000) {
      param_1[0x15] = param_1[0x15] & 0xffff;
      param_1[0x18] = param_1[0x18] + (int)param_1;
      param_1[0x19] = param_1[0x19] + (int)param_1;
      param_1[0x1b] = param_1[0x1b] + (int)param_1;
      return;
    }
    param_1[0x18] = 0;
  }
  return;
}


FUNCTION 80028b94 FUN_80028b94

void FUN_80028b94(int param_1,int param_2,int param_3,undefined4 *param_4)

{
  undefined4 uVar1;
  int iVar2;
  
  iVar2 = 0;
  param_4[1] = 0;
  param_4[2] = 0;
  param_4[3] = 0;
  if (param_1 != 0) {
    iVar2 = param_1 >> 1;
    uVar1 = FUN_80028d6c(iVar2);
    param_4[1] = uVar1;
  }
  if (param_2 != 0) {
    iVar2 = param_2 * 0x6488 >> 9;
    uVar1 = FUN_80028d6c(iVar2);
    param_4[2] = uVar1;
  }
  if (param_3 != 0) {
    iVar2 = param_3 * 0x6488 >> 9;
    uVar1 = FUN_80028d6c(iVar2);
    param_4[3] = uVar1;
  }
  uVar1 = FUN_80028c74(iVar2);
  *param_4 = uVar1;
  return;
}


FUNCTION 800288b4 FUN_800288b4

void FUN_800288b4(int *param_1,undefined2 *param_2)

{
  longlong lVar1;
  longlong lVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  uint uVar6;
  uint uVar7;
  uint uVar8;
  uint uVar9;
  uint uVar10;
  int iVar11;
  
  lVar1 = (longlong)param_1[1] * (longlong)param_1[1];
  uVar6 = (int)((ulonglong)lVar1 >> 0x20) << 0x10 | (uint)lVar1 >> 0x10;
  lVar1 = (longlong)param_1[2] * (longlong)param_1[2];
  uVar7 = (int)((ulonglong)lVar1 >> 0x20) << 0x10 | (uint)lVar1 >> 0x10;
  lVar1 = (longlong)param_1[3] * (longlong)param_1[3];
  iVar11 = *param_1;
  uVar8 = (int)((ulonglong)((longlong)param_1[1] * (longlong)iVar11) >> 0x20) << 0x10 |
          (uint)((longlong)param_1[1] * (longlong)iVar11) >> 0x10;
  uVar9 = (int)((ulonglong)((longlong)param_1[2] * (longlong)iVar11) >> 0x20) << 0x10 |
          (uint)((longlong)param_1[2] * (longlong)iVar11) >> 0x10;
  uVar10 = (int)((ulonglong)((longlong)param_1[3] * (longlong)iVar11) >> 0x20) << 0x10 |
           (uint)((longlong)param_1[3] * (longlong)iVar11) >> 0x10;
  lVar2 = (longlong)param_1[1] * (longlong)param_1[2];
  iVar4 = ((int)((ulonglong)lVar2 >> 0x20) << 0x10 | (uint)lVar2 >> 0x10) * 2;
  lVar2 = (longlong)param_1[1] * (longlong)param_1[3];
  iVar5 = ((int)((ulonglong)lVar2 >> 0x20) << 0x10 | (uint)lVar2 >> 0x10) * 2;
  lVar2 = (longlong)param_1[2] * (longlong)param_1[3];
  iVar3 = ((int)((ulonglong)lVar1 >> 0x20) << 0x10 | (uint)lVar1 >> 0x10) * -2 + 0x10000;
  *param_2 = (short)((int)(iVar3 + uVar7 * -2) >> 4);
  param_2[1] = (short)((int)(iVar4 + uVar10 * -2) >> 4);
  iVar11 = ((int)((ulonglong)lVar2 >> 0x20) << 0x10 | (uint)lVar2 >> 0x10) * 2;
  param_2[2] = (short)((int)(iVar5 + uVar9 * 2) >> 4);
  param_2[3] = (short)((int)(iVar4 + uVar10 * 2) >> 4);
  param_2[4] = (short)((int)(iVar3 + uVar6 * -2) >> 4);
  param_2[5] = (short)((int)(iVar11 + uVar8 * -2) >> 4);
  param_2[6] = (short)((int)(iVar5 + uVar9 * -2) >> 4);
  param_2[7] = (short)((int)(iVar11 + uVar8 * 2) >> 4);
  param_2[8] = (short)((int)(uVar7 * -2 + 0x10000 + uVar6 * -2) >> 4);
  return;
}


FUNCTION 80094194 FUN_80094194

void FUN_80094194(undefined2 param_1)

{
  FUN_80093ec0(param_1);
  return;
}


