
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_004717e0(void)

{
  char cVar1;
  byte *pbVar2;
  undefined4 uVar3;
  undefined3 uVar4;
  undefined *puVar5;
  undefined *puVar6;
  undefined *puVar7;
  undefined *puVar8;
  undefined *puVar9;
  undefined *puVar10;
  byte bVar11;
  short sVar12;
  undefined4 *puVar13;
  uint uVar14;
  undefined **ppuVar15;
  undefined2 *puVar16;
  int iVar17;
  undefined1 uVar21;
  undefined4 uVar18;
  uint uVar19;
  int iVar20;
  byte in_CL;
  undefined2 uVar22;
  uint uVar23;
  undefined4 extraout_ECX;
  undefined *puVar24;
  char *pcVar25;
  undefined4 extraout_ECX_00;
  undefined4 extraout_ECX_01;
  undefined4 extraout_ECX_02;
  undefined4 extraout_ECX_03;
  undefined4 extraout_ECX_04;
  undefined4 extraout_ECX_05;
  undefined4 extraout_ECX_06;
  undefined *puVar26;
  char cVar27;
  uint uVar28;
  undefined1 uVar29;
  byte bVar30;
  ushort uVar31;
  undefined *puVar32;
  char *pcVar33;
  uint *puVar34;
  undefined4 *puVar35;
  undefined1 *puVar36;
  uint uVar37;
  byte *pbVar38;
  bool bVar39;
  float fVar40;
  float fVar41;
  undefined8 uVar42;
  char *pcVar43;
  uint *local_3a4;
  undefined4 *local_3a0;
  byte *local_39c;
  undefined1 *local_398;
  undefined4 *local_394;
  char *local_390;
  uint local_388;
  undefined1 local_37c [255];
  undefined1 local_27d;
  undefined4 uStack_275;
  undefined1 local_175;
  char local_16a [61];
  undefined4 uStack_12d;
  undefined1 local_b4 [8];
  undefined4 auStack_ac [29];
  undefined1 local_35;
  byte local_28 [4];
  undefined4 local_24;
  undefined8 uStack_20;
  undefined4 uStack_18;
  char local_14 [4];
  uint local_10;
  undefined1 local_c;
  uint local_8;
  
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  memset(local_37c,0x2d,0x100);
  iVar20 = DAT_0062fd28;
  local_27d = 0;
  uVar23 = 0;
  do {
    if ((uVar23 & 0xffff) < 0xc) {
      *(undefined4 *)((uVar23 & 0xffff) * 0x410 + iVar20) = 0;
    }
    uVar23 = uVar23 + 1;
  } while (uVar23 < 0xc);
  uVar23 = 0;
  DAT_0062fac4 = 0;
  DAT_0062fac0 = 0;
  do {
    (&DAT_006c74a1)[uVar23] = 0;
    *(undefined2 *)((int)&DAT_006c74be + uVar23) = 0;
    uVar23 = uVar23 + 0x420;
  } while (uVar23 < 0x84000);
  puVar13 = &DAT_0062f430;
  do {
    *puVar13 = 0;
    puVar13 = puVar13 + 9;
  } while ((int)puVar13 < 0x62f8b0);
  _DAT_006c1300 = 1;
  DAT_006c1ac0 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_SELECT_00517590);
  DAT_006c1ac4 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_BACK_005175a0);
  DAT_006c1ac8 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_FINISH_005175ac);
  DAT_006c1acc = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_DELETE_005175bc);
  DAT_006c1ad0 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_NO_CONTROLLER_005175cc
                             );
  DAT_006c1ad4 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_ACTION_ENTER_005175e4);
  uVar23 = 0;
  do {
    *(undefined4 *)(&DAT_006c1360 + uVar23) = 0;
    *(undefined4 *)((int)&DAT_006c1364 + uVar23) = 0;
    *(undefined4 *)((int)&DAT_006c1388 + uVar23) = 0;
    uVar23 = uVar23 + 0x2c;
  } while (uVar23 < 0x580);
  FUN_00459970();
  uVar23 = DAT_0060e390;
  puVar10 = PTR_PTR_00515a24;
  puVar32 = PTR_PTR_005159f8;
  puVar9 = PTR_PTR_005159e8;
  puVar8 = PTR_PTR_005159e4;
  puVar7 = PTR_PTR_005159dc;
  puVar6 = PTR_PTR_005159c8;
  puVar5 = PTR_PTR_005159c4;
  puVar24 = PTR_DAT_00513214;
  puVar26 = PTR_DAT_00513210;
  uVar14 = (uint)in_CL;
  DAT_0060e217 = 0;
  switch(uVar14) {
  case 0:
    bVar39 = DAT_005192b8 != 2;
    PTR_PTR_005159a8 = (undefined *)&PTR_s_CONFIRM_00516768;
    PTR_DAT_00513214[0x1e] = 0;
    puVar26 = PTR_PTR_00515980;
    *(undefined2 *)(PTR_PTR_00515980 + 0x34) = 0x202;
    if (bVar39) {
      puVar26[0x2f] = 1;
    }
    puVar24 = PTR_PTR_00515988;
    puVar26 = PTR_PTR_00515984;
    DAT_0051237e = 0;
    DAT_0060e438 = 0;
    PTR_PTR_00515988[0x14] = 0;
    puVar26[0x14] = 0;
    puVar24[0x15] = 0;
    puVar26[0x15] = 0;
    *(undefined2 *)(puVar24 + 8) = 0;
    *(undefined2 *)(puVar26 + 8) = 0;
    *(undefined2 *)(puVar24 + 10) = 0;
    *(undefined2 *)(puVar26 + 10) = 0;
    puVar26 = PTR_PTR_0051598c;
    *(undefined2 *)(PTR_PTR_0051598c + 0x14) = 0;
    *(undefined4 *)(puVar26 + 8) = 0;
    FUN_0045fa90();
    puVar26 = PTR_PTR_00515980;
    PTR_PTR_00515980[0x17] = 0x2e;
    *(undefined2 *)(puVar26 + 0x1c) = 0xd00;
    FUN_004799e0();
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_MAIN_TEXT_0051760c);
    puVar26 = PTR_DAT_00513210;
    DAT_006c1069 = 1;
    DAT_006c0de6 = (short)(char)PTR_PTR_00515980[0x14] << 7;
    DAT_006c1040 = (char)PTR_PTR_00515980[0x14] * 0xa0;
    DAT_006c0dd8 = 0;
    _DAT_006c1300 = 0;
    DAT_006c1061 = '\0';
    DAT_006c0de8 = '\0';
    DAT_006c106a = 0;
    PTR_DAT_00513210[0x27a] = 0;
    *(undefined2 *)(puVar26 + 0x274) = 0;
    break;
  case 1:
    DAT_006c0dce = '\0';
    DAT_006c0dcd = 0;
    PTR_DAT_00513210[0x40d] = PTR_DAT_00513210[0x40d] & 1;
    *(undefined2 *)(puVar26 + 0x2d8) = 0;
    puVar26[0x2d1] = 0;
    DAT_006c106a = 0;
    FUN_00461c20(0x68,s_TYPEI_HELP_00517618,DAT_00517034,0);
    FUN_00461c20(0x68,s_TYPEII_HELP_00517624,DAT_00517034,0);
    FUN_00461c20(0x68,s_TYPEIII_HELP_00517630,DAT_00517034,0);
    FUN_0045fa90();
    FUN_0047b110(0);
    puVar24 = PTR_PTR_00515984;
    puVar26 = PTR_DAT_00513210;
    DAT_00516518 = 0x7f < (byte)PTR_DAT_00513210[0x401];
    DAT_00516519 = (byte)PTR_DAT_00513210[0x401] >> 3 & 1;
    PTR_PTR_00515984[0x30] = -((PTR_DAT_00513210[0x401] & 0x30) < 0x10) & 2;
    puVar24[0x31] = -((puVar26[0x401] & 0x30) < 0x20) & 2;
    puVar24[0x35] = (puVar26[0x402] != '\0') - 1U & 2;
    puVar24[0x36] = (byte)puVar26[0x400] >> 4 & 2;
    puVar24[0x37] = (puVar26[0x401] & 1) * '\x02';
    puVar24[0x38] = (byte)puVar26[0x400] >> 5 & 2;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_MAIN_TEXT_00517640);
    puVar26 = PTR_PTR_00515984;
    PTR_DAT_0051599c = &DAT_00515840;
    PTR_PTR_00515984[0x17] = 0;
    _DAT_005149f4 = 0;
    *(undefined2 *)(puVar26 + 0x1c) = 0x400;
    puVar26 = PTR_DAT_00513210;
    _DAT_00515348 = 0;
    _DAT_0051535e = 0;
    _DAT_005149e8 = 0;
    _DAT_005149fe = 0;
    _DAT_00515354 = 0;
    DAT_0051237e = 3;
    DAT_006c1069 = 1;
    *(undefined4 *)(PTR_DAT_00513210 + 0x268) = 0;
    *(undefined2 *)(puVar26 + 0x274) = 0;
    break;
  case 2:
    DAT_006c0dce = '\0';
    DAT_006c0dcd = 0;
    PTR_DAT_00513210[0x2d1] = 0;
    DAT_006c106a = 0;
    FUN_0047b110(0);
    bVar11 = DAT_006c1069;
    puVar24 = PTR_PTR_00515988;
    PTR_PTR_00515988[0x32] = (-((byte)puVar26[0x400] < 0x80) & 0xfeU) + 2;
    puVar24[0x33] = puVar26[0x401] & 2;
    puVar24[0x34] = (-((puVar26[0x404] & 0xf0) != 0) & 0xfeU) + 2;
    puVar24[0x35] = (byte)puVar26[0x401] >> 5 & 2;
    if (((PTR_DAT_00513214[0x1e] == '\0') && (bVar11 != 2)) ||
       ((PTR_DAT_00513214[0x1e] == '\x01' && (PTR_DAT_00513214[0x2a] != '\0')))) {
      uVar21 = 1;
      puVar24 = PTR_PTR_00515988;
    }
    else {
      uVar21 = 0;
    }
    puVar24[0x30] = uVar21;
    if (((PTR_DAT_00513214[0x1e] == '\0') && (bVar11 != 2)) ||
       ((PTR_DAT_00513214[0x1e] == '\x01' && (PTR_DAT_00513214[0x2a] != '\0')))) {
      uVar21 = 1;
      puVar24 = PTR_PTR_00515988;
    }
    else {
      uVar21 = puVar24[0x32];
    }
    puVar24[0x32] = uVar21;
    if (((PTR_DAT_00513214[0x1e] == '\0') && (bVar11 != 2)) ||
       ((PTR_DAT_00513214[0x1e] == '\x01' && (PTR_DAT_00513214[0x2a] != '\0')))) {
      uVar21 = 1;
    }
    else {
      uVar21 = puVar24[0x35];
    }
    puVar24[0x35] = uVar21;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_MAIN_TEXT_0051764c);
    puVar26 = PTR_PTR_005159a4;
    PTR_DAT_0051599c = &DAT_00515840;
    *(undefined2 *)(PTR_PTR_005159a4 + 0x14) = 0;
    *(undefined4 *)(puVar26 + 8) = 0;
    puVar26 = PTR_PTR_00515988;
    if (PTR_DAT_00513214[0x1e] == '\x01') {
      PTR_PTR_00515988[0x17] = 0x1e;
      uVar22 = 0x300;
    }
    else {
      PTR_PTR_00515988[0x17] = 0;
      uVar22 = 0x400;
    }
    *(undefined2 *)(puVar26 + 0x1c) = uVar22;
    _DAT_005149e8 = 0;
    _DAT_00515348 = 0;
    _DAT_005149fe = 0;
    _DAT_0051535e = 0;
    _DAT_005149f4 = 0;
    _DAT_00515354 = 0;
    DAT_0051237e = 2;
    DAT_006c1438 = &DAT_0060e39d;
    _DAT_006c1410 = CONCAT13(DAT_0060e39d,0xc0b02);
    FUN_0045fa90();
    break;
  default:
    break;
  case 7:
    FUN_0047aca0();
    puVar26 = PTR_DAT_00513210;
    bVar11 = PTR_DAT_00513210[0x401];
    PTR_DAT_00513210[0x2d1] = 0;
    puVar26[0x403] = 0x13;
    if (((bVar11 & 0x30) < 0x20) && ((puVar26[0x400] & 0x10) != 0)) {
      puVar26[0x403] = 0xf;
    }
    if ((bVar11 & 0x30) == 0) {
      bVar11 = puVar26[0x400];
      if ((bVar11 & 8) != 0) {
        puVar26[0x403] = 0xb;
      }
      if ((bVar11 & 4) != 0) {
        puVar26[0x403] = 7;
      }
      if ((bVar11 & 2) != 0) {
        puVar26[0x403] = 3;
      }
    }
    *(undefined2 *)(PTR_DAT_0051599c + 0x14) = 0;
    *(undefined4 *)(PTR_DAT_0051599c + 8) = 0;
    cVar27 = DAT_006c0de8;
    switch(DAT_006c1061) {
    case '\0':
    case '\x0f':
      DAT_00514c74 = 0;
      PTR_DAT_0051599c = &DAT_00514c60;
      *(undefined4 *)(puVar26 + 0xc) = 0;
      *(undefined4 *)(puVar26 + 0x10) = 0;
      *(undefined4 *)(puVar26 + 0x14) = 0;
      *(undefined4 *)(puVar26 + 0x18) = 0;
      *(undefined4 *)(puVar26 + 0x1c) = 0;
      *(undefined4 *)(puVar26 + 0x20) = 0;
      _DAT_00514c90 = 0;
      uVar23 = CONCAT11(puVar26[0x401],puVar26[0x401]) & 0xffffff30;
      if (((byte)uVar23 < 0x20) && (((byte)(uVar23 >> 8) >> 4 & 3) == puVar26[0x2b9])) {
        _DAT_00514c90 =
             CONCAT13((byte)puVar26[0x400] >> 4,
                      CONCAT12((byte)puVar26[0x400] >> 3,
                               CONCAT11((byte)puVar26[0x400] >> 2,(byte)puVar26[0x400] >> 1))) &
             0x1010101;
      }
      if ((puVar26[0x2b9] == '\0') ||
         (((puVar26[0x401] & 0x30) == 0x10 && ((puVar26[0x400] & 0x10) != 0)))) {
        _DAT_00514c90 = CONCAT13(2,_DAT_00514c90);
      }
      if ((puVar26[0x2b9] != '\x02') &&
         (uVar23 = CONCAT11(puVar26[0x2b9],(byte)puVar26[0x401] >> 4) & 0xffffff03,
         (char)(uVar23 >> 8) == (char)uVar23)) {
        bVar11 = puVar26[0x400];
        DAT_00514c74 = (bVar11 & 2) == 0;
        if ((bVar11 & 4) == 0) {
          DAT_00514c74 = 2;
        }
        if ((bVar11 & 8) == 0) {
          DAT_00514c74 = 3;
        }
        if ((bVar11 & 0x10) == 0) {
          DAT_00514c74 = 4;
        }
      }
      _DAT_00514c68 = 0;
      DAT_00514c75 = DAT_00514c74;
      break;
    default:
      DAT_00515872 = (byte)puVar26[0x403] < 4;
      PTR_DAT_0051599c = &DAT_00515840;
      DAT_00515874 = (byte)puVar26[0x403] < 0x11;
      if (DAT_006c0de8 != '\0') {
        DAT_00515872 = 0;
        DAT_00515874 = 0;
      }
      break;
    case '\x03':
      DAT_005148cf = (puVar26[0x404] & 0xf0) == 0;
      PTR_DAT_0051599c = (undefined *)&PTR_s_DEATHMATCH_005148a0;
      DAT_005148d0 = (puVar26[0x404] & 0xf0) < 0x11;
      DAT_005148d1 = (puVar26[0x404] & 0xf0) < 0x21;
      DAT_005148d2 = (puVar26[0x404] & 0xf0) < 0x31;
      DAT_005148d3 = (puVar26[0x404] & 0xf0) < 0x41;
      break;
    case '\x06':
      uVar23 = 0;
      PTR_DAT_0051599c = &DAT_005153e0;
      _DAT_006c1064 = 0x1212;
      do {
        (&DAT_0051540f)[uVar23] = (byte)puVar26[0x402] <= uVar23;
        if (cVar27 != '\0') {
          (&DAT_0051540f)[uVar23] = 0;
        }
        uVar23 = uVar23 + 1;
      } while (uVar23 < 0x19);
      break;
    case '\a':
      PTR_DAT_0051599c = &DAT_00516588;
      break;
    case '\t':
      PTR_DAT_0051599c = (undefined *)&PTR_s_DEATHMATCH_00515ea8;
      break;
    case '\x0e':
      _DAT_006c1064 = 0;
      uVar23 = 0;
      PTR_DAT_0051599c = (undefined *)&PTR_s_TRAINING_005152a0;
      do {
        (&DAT_005152cf)[uVar23] = ((byte)puVar26[0x404] & 0xf) <= uVar23;
        if (cVar27 != '\0') {
          (&DAT_005152cf)[uVar23] = 0;
        }
        uVar23 = uVar23 + 1;
      } while (uVar23 < 10);
    }
    FUN_0045fa90();
    if ((DAT_006c1061 == '\0') || (DAT_006c1061 == '\x0f')) {
      cVar27 = PTR_DAT_0051599c[0x14];
      if (cVar27 < '\x05') {
        sVar12 = cVar27 + 10;
      }
      else {
        sVar12 = 0xe;
      }
      DAT_006c1040 = sVar12 * 0xfa + -4;
      if (cVar27 < '\x05') {
        DAT_006c0de6 = (cVar27 + 10) * 0xdc + -4;
      }
      else {
        DAT_006c0de6 = 0xc04;
      }
    }
    else {
      cVar27 = PTR_DAT_0051599c[0x14];
      sVar12 = (short)cVar27;
      if ('\x05' < cVar27) {
        sVar12 = 5;
      }
      DAT_006c1040 = sVar12 * 0xfa + -4;
      sVar12 = (short)cVar27;
      if ('\x05' < cVar27) {
        sVar12 = 5;
      }
      DAT_006c0de6 = sVar12 * 0xdc + -4;
    }
    break;
  case 9:
    FUN_00461c20(0x68,s_TRACK_LIST_ERROR_005176d0,DAT_00517034,0);
    FUN_0045fa90();
    puVar24 = PTR_PTR_005159a4;
    puVar26 = PTR_DAT_00513210;
    *(undefined4 *)(PTR_PTR_005159a4 + 0x32) = 0;
    *(undefined2 *)(puVar24 + 0x36) = 0;
    uVar23 = (uint)(byte)puVar26[0x279];
    if (uVar23 < 9) {
      puVar13 = (undefined4 *)(puVar24 + uVar23 + 0x2f);
      for (uVar28 = 9 - uVar23 >> 2; uVar28 != 0; uVar28 = uVar28 - 1) {
        *puVar13 = 0x2020202;
        puVar13 = puVar13 + 1;
      }
      for (uVar23 = 9 - uVar23 & 3; uVar23 != 0; uVar23 = uVar23 - 1) {
        *(undefined1 *)puVar13 = 2;
        puVar13 = (undefined4 *)((int)puVar13 + 1);
      }
    }
    uVar23 = 0x52;
    iVar20 = 0;
    do {
      if (puVar26[uVar23] != '\0') {
        uVar18 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,0,0,s_WORLD_005176e4);
        *(undefined4 *)((int)&DAT_0060e3d0 + iVar20) = uVar18;
        uVar18 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,0,0,
                              (&PTR_s_oooooo_004f2994)[(byte)PTR_DAT_00513210[uVar23]]);
        puVar26 = PTR_DAT_00513210;
        *(undefined4 *)((int)&DAT_0060e3ac + iVar20) = uVar18;
      }
      uVar23 = uVar23 + 2;
      iVar20 = iVar20 + 4;
    } while (uVar23 < 100);
    break;
  case 10:
    DAT_006c1050 = 0;
    FUN_0047aca0();
    FUN_0047a3b0();
    iVar20 = FUN_00471610();
    if (iVar20 != 0) {
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,iVar20);
    }
    FUN_00461c20(0x82,s_LEV01_TEXT_00517084,DAT_00517034,8);
    DAT_0060e377 = 0;
    DAT_0060e376 = 0;
    _DAT_006c13e4 = 0x401;
    _DAT_006c0d60 = 0xff;
    DAT_006c13e6 = ((byte)PTR_DAT_00513210[0x401] >> 4 & 3) + 4;
    DAT_006c0dd4 = 0xff;
    _DAT_006c140c = PTR_DAT_00513210 + 0x2b9;
    DAT_006c13e7 = *_DAT_006c140c;
    DAT_006c1438 = PTR_DAT_00513210 + 0x19da;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x620004);
    _DAT_006c1464 = PTR_DAT_00513210 + 0x19c0;
    _DAT_006c143c = 0xe01;
    DAT_006c143e = 0xf;
    DAT_006c143f = *_DAT_006c1464;
    DAT_006c0dec = 0xff;
    DAT_006c1044 = 0xff;
    FUN_0045fa90();
    puVar26 = PTR_PTR_005159a8;
    bVar39 = DAT_006c1069 == 2;
    *(undefined2 *)(PTR_PTR_005159a8 + 0x14) = 0;
    *(undefined4 *)(puVar26 + 8) = 0;
    DAT_00515aff = 10;
    _DAT_00515b04 = 0x100;
    *(undefined4 *)(puVar26 + 0x2f) = 0;
    *(undefined4 *)(puVar26 + 0x33) = 0;
    *(undefined4 *)(puVar26 + 0x37) = 0;
    *(undefined4 *)(puVar26 + 0x3b) = 0;
    if (bVar39) {
      puVar26[0x32] = 2;
    }
    else {
      puVar26[0x34] = 2;
    }
    switch(DAT_006c1061) {
    case '\0':
    case '\b':
    case '\r':
    case '\x0f':
      puVar26[0x32] = 2;
    case '\n':
    case '\v':
      *(undefined2 *)(puVar26 + 0x32) = 0x202;
      puVar26[0x30] = 2;
      break;
    case '\x06':
    case '\x0e':
      puVar26[0x31] = 2;
      DAT_006c1063 = 0;
      DAT_006c1060 = 0;
    case '\x01':
    case '\x03':
    case '\a':
    case '\t':
      *(undefined2 *)(puVar26 + 0x32) = 0x202;
    }
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_CONFIRM_TEXT_005176ec);
    break;
  case 0xb:
    DAT_006c1054._0_1_ = DAT_006c1064;
    DAT_006c1054._1_1_ = DAT_006c1065;
    DAT_006c1054._2_1_ = DAT_006c1066;
    DAT_006c1054._3_1_ = DAT_006c1067;
    _DAT_006c0d60 = 0xff;
    DAT_006c0dd4 = 0xff;
    DAT_006c0dec = 0xff;
    DAT_006c1044 = 0xff;
    FUN_0047a3b0();
    FUN_0045fa90();
    FUN_0047bc60();
    FUN_0047b770();
    DAT_005149f9 = DAT_005149f9 | 4;
    DAT_006c1058 = 0;
    DAT_006c1059 = 0;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_STATS_00517740);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_STATS_00517748);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_TYPES_00517750);
    DAT_006c110c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_TYPES_00517758);
    DAT_006c1110 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,0,0,s_CAR_NAMES_00517760);
    DAT_006c1114 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,0,0,s_CAR_NAMES_0051776c);
    DAT_006c1118 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,0,0,s_CARRY_WEAPONS_00517778);
    puVar26 = PTR_PTR_005159ac;
    uVar23 = 0;
    _DAT_00514a0f = 0x1010101;
    DAT_00514a13 = 1;
    *(undefined4 *)(PTR_PTR_005159ac + 0x2f) = 0x1010101;
    puVar26[0x33] = 1;
    do {
      if ((&DAT_00516c49)[uVar23] == '\0') {
        _DAT_00514a0f = _DAT_00514a0f & 0xffffff00;
        puVar26[0x2f] = 0;
      }
      if ((&DAT_00516c19)[uVar23] == '\0') {
        _DAT_00514a0f = (ushort)DAT_00514a0f;
        puVar26[0x30] = 0;
      }
      if ((&DAT_00516c01)[uVar23] == '\0') {
        _DAT_00514a0f = (uint3)_DAT_00514a0f;
        puVar26[0x31] = 0;
      }
      if ((&DAT_00516c31)[uVar23] == '\0') {
        _DAT_00514a0f = _DAT_00514a0f & 0xffffff;
        puVar26[0x32] = 0;
      }
      if ((&DAT_00516be9)[uVar23] == '\0') {
        DAT_00514a13 = 0;
        puVar26[0x33] = 0;
      }
      uVar23 = uVar23 + 2;
    } while (uVar23 < 0x18);
    local_388 = 0;
    local_394 = &DAT_006c0e10;
    local_39c = (byte *)0x8;
    fVar40 = (float)(DAT_00696ae8 * 0x14 >> 8);
    fVar41 = (float)(DAT_00696aec * 0x16 >> 8);
    do {
      pbVar38 = (byte *)((*(ushort *)(DAT_006c0b50 + 0x2e) + 2 + (local_388 & 1)) * 0x10 +
                        DAT_00791590);
      uVar18 = *(undefined4 *)(pbVar38 + 4);
      uVar3 = *(undefined4 *)pbVar38;
      *(undefined1 *)((int)local_394 + -9) = 0xbc;
      uVar31 = (ushort)((uint)uVar18 >> 0x10) & 0x3f | 0x80;
      *local_394 = 0x40400000;
      uVar29 = (undefined1)uVar3;
      *(undefined1 *)(local_394 + 1) = uVar29;
      *(ushort *)((int)local_394 + 6) = uVar31;
      uVar21 = (undefined1)((uint)uVar3 >> 8);
      *(undefined1 *)((int)local_394 + 5) = uVar21;
      *(ushort *)(local_394 + 4) = (ushort)pbVar38[4] - (ushort)*pbVar38;
      *(ushort *)((int)local_394 + 0x12) = (ushort)pbVar38[9] - (ushort)pbVar38[1];
      local_394[-3] = 0xbefefefe;
      local_394[2] = fVar40;
      local_394[3] = fVar41;
      *(undefined1 *)((int)local_394 + 0x117) = 0xbc;
      *(ushort *)((int)local_394 + 0x126) = uVar31;
      local_394[0x48] = 0x40400000;
      *(undefined1 *)(local_394 + 0x49) = uVar29;
      *(undefined1 *)((int)local_394 + 0x125) = uVar21;
      *(ushort *)(local_394 + 0x4c) = (ushort)pbVar38[4] - (ushort)*pbVar38;
      *(ushort *)((int)local_394 + 0x132) = (ushort)pbVar38[9] - (ushort)pbVar38[1];
      *(undefined2 *)(local_394 + 0x45) = 0xfefe;
      local_388 = local_388 + 1;
      *(undefined1 *)((int)local_394 + 0x116) = 0xfe;
      local_394[0x4a] = fVar40;
      local_394[0x4b] = fVar41;
      *(byte *)((int)local_394 + 0x117) = *(byte *)((int)local_394 + 0x117) | 2;
      local_394 = local_394 + 9;
      local_39c = (byte *)((int)local_39c + -1);
    } while (local_39c != (byte *)0x0);
    break;
  case 0xc:
    _DAT_006c0d60 = 0xff;
    DAT_006c0dd4 = 0xff;
    DAT_006c0dec = 0xff;
    DAT_006c1044 = 0xff;
    FUN_0047a3b0();
    FUN_0045fa90();
    FUN_0047bc60();
    FUN_0047b770();
    puVar26 = PTR_PTR_005159b0;
    PTR_PTR_005159b0[0x17] = 0xc;
    *(undefined2 *)(puVar26 + 0x1c) = 0x300;
    _DAT_006c1300 = 0;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_STATS_005176fc);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_TYPES_00517704);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,0,0,s_CAR_NAMES_0051770c);
    DAT_006c110c = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517038,4,0,s_CAR_AWARDED_00517718);
    DAT_006c1110 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517038,4,0,s_GOLDEN_KEY_00517724);
    DAT_006c1114 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_CARRY_WEAPONS2_00517730);
    break;
  case 0xd:
    _DAT_006c1360 = 3;
    DAT_006c1362 = '\0';
    DAT_0051237e = 1;
    DAT_006c1388 = PTR_DAT_00513210 + 0x19b6;
    DAT_006c1363 = *DAT_006c1388;
    DAT_006c13b4 = PTR_DAT_00513210 + 0x19b4;
    _DAT_006c138c = 3;
    DAT_006c138e = 0;
    DAT_006c138f = *DAT_006c13b4;
    DAT_006c1438 = PTR_DAT_00513210 + 0x2af;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0xd0c01);
    FUN_0045fa90();
    FUN_004792d0();
    FUN_00479160();
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,0,0,s_MUSIC_ARTISTS_00517788);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517044,0,0,s_MUSIC_TRACKS_00517798);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MUSIC_SUPPLIER_005177a8);
    break;
  case 0xe:
    DAT_0051237e = 1;
    FUN_0047b110(0);
    FUN_0047a3b0();
    FUN_0045fa90();
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_BEG_TEXT_005177b8);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_EXP_TEXT_005177c4);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MAS_TEXT_005177d0);
    DAT_006c110c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_PURS_TEXT_005177dc);
    DAT_006c1110 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_ALLT_TEXT_005177e8);
    DAT_006c1114 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEMO1_TEXT_005177f4);
    DAT_006c1118 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEMO2_TEXT_00517800);
    DAT_006c111c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_SURV_TEXT_0051780c);
    DAT_006c1120 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_SOCC_TEXT_00517818);
    DAT_006c1124 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH1_TEXT_00517824);
    DAT_006c1128 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH2_TEXT_00517830);
    DAT_006c112c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH3_TEXT_0051783c);
    DAT_006c1130 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH4_TEXT_00517848);
    DAT_006c1134 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH5_TEXT_00517854);
    DAT_006c1138 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MIRR_TEXT_00517860);
    DAT_006c113c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MEGA_TEXT_0051786c);
    DAT_006c1140 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_ATIMES_TEXT_00517878);
    memset(local_b4,0x2d,0x80);
    local_35 = 0;
    uVar23 = 0;
    do {
      uVar18 = FUN_0045cbc0(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,local_b4);
      *(undefined4 *)((int)&DAT_006c1150 + uVar23) = uVar18;
      uVar18 = FUN_0045cbc0(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,local_b4);
      *(undefined4 *)((int)&DAT_006c1164 + uVar23) = uVar18;
      uVar23 = uVar23 + 4;
    } while (uVar23 < 0x14);
    uVar23 = 0;
    do {
      cVar27 = (&DAT_00516c19)[uVar23 * 2];
      (&DAT_006c0d80)[uVar23] = (&DAT_00516c49)[uVar23 * 2] != '\0';
      cVar1 = (&DAT_00516c01)[uVar23 * 2];
      (&DAT_006c0d8c)[uVar23] = cVar27 != '\0';
      cVar27 = (&DAT_00516c31)[uVar23 * 2];
      (&DAT_006c0d98)[uVar23] = cVar1 != '\0';
      cVar1 = (&DAT_00516be9)[uVar23 * 2];
      (&DAT_006c0da4)[uVar23] = cVar27 != '\0';
      (&DAT_006c0db0)[uVar23] = cVar1 != '\0';
      uVar23 = uVar23 + 1;
    } while (uVar23 < 0xc);
    DAT_006c0dcc = -(DAT_0060e374 != '\0') & 3;
    DAT_006c0dbc = ~-(DAT_0060e364 == '\0') & 3;
    bRam006c0dbd = ~-(DAT_0060e365 == '\0') & 3;
    bRam006c0dbe = ~-(DAT_0060e366 == '\0') & 3;
    bRam006c0dbf = ~-(DAT_0060e367 == '\0') & 3;
    bRam006c0dc0 = ~-(DAT_0060e368 == '\0') & 3;
    bRam006c0dc1 = ~-(DAT_0060e369 == '\0') & 3;
    bRam006c0dc2 = ~-(DAT_0060e36a == '\0') & 3;
    bRam006c0dc3 = ~-(DAT_0060e36b == '\0') & 3;
    bRam006c0dc4 = ~-(DAT_0060e36c == '\0') & 3;
    bRam006c0dc5 = ~-(DAT_0060e36d == '\0') & 3;
    bRam006c0dc6 = ~-(DAT_0060e36e == '\0') & 3;
    bRam006c0dc7 = ~-(DAT_0060e36f == '\0') & 3;
    bRam006c0dc8 = ~-(DAT_0060e370 == '\0') & 3;
    bRam006c0dc9 = ~-(DAT_0060e371 == '\0') & 3;
    bRam006c0dca = ~-(DAT_0060e372 == '\0') & 3;
    bRam006c0dcb = ~-(DAT_0060e373 == '\0') & 3;
    break;
  case 0xf:
    local_28[0] = 3;
    local_28[1] = 9;
    local_28[2] = 0xe;
    local_28[3] = 0;
    local_24._0_1_ = '\x02';
    local_24._1_1_ = '\x06';
    local_24._2_1_ = '\b';
    local_24._3_1_ = '\x0f';
    uStack_20 = 0xc0b04000d0500;
    uStack_18 = 0xa0701;
    builtin_strncpy(local_14,"\x10\x11\x12\x13",4);
    FUN_0045fa90();
    FUN_0047ba80();
    switch(DAT_006c1061) {
    case '\x06':
      puVar34 = (uint *)(PTR_DAT_00513210 + (char)PTR_DAT_0051599c[0x14] * 0x50 + 0xa54);
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_LEAGUE_TITLE_005179ec);
      pcVar43 = s_SCRAMBLE_005179fc;
      break;
    case '\a':
      puVar34 = (uint *)(PTR_DAT_00513210 + (char)PTR_DAT_0051599c[0x14] * 0x50 + 0x1544);
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_LEAGUE_TITLE_00517a24);
      pcVar43 = s_DEMOLITION_00517a34;
      break;
    default:
      puVar34 = (uint *)(PTR_DAT_00513210 +
                        (uint)local_28[(uint)DAT_006c1063 * 4 + (uint)DAT_006c1060] * 0x50 + 0x414);
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_LEAGUE_TITLE_00517a84);
      DAT_006c1104 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,
                                  (&PTR_s_HARPOON_004f2998)[DAT_006c1063]);
      goto LAB_004747b4;
    case '\t':
      puVar34 = (uint *)(PTR_DAT_00513210 + (char)PTR_DAT_0051599c[0x14] * 0x50 + 0x16d4);
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_LEAGUE_TITLE_00517a40);
      pcVar43 = s_PURSUIT_TRACKS_00517a50;
      break;
    case '\n':
      puVar34 = (uint *)(PTR_DAT_00513210 + 0x18b4);
      pcVar43 = s_ALL_TRACKS_TITLE_00517a70;
      goto LAB_0047470a;
    case '\v':
      puVar34 = (uint *)(PTR_DAT_00513210 + 0x1864);
      pcVar43 = s_SURVIVOR_TITLE_00517a60;
LAB_0047470a:
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,pcVar43);
      goto LAB_004747b4;
    case '\x0e':
      puVar34 = (uint *)(PTR_DAT_00513210 + (char)PTR_DAT_0051599c[0x14] * 0x50 + 0x1224);
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_LEAGUE_TITLE_00517a08);
      pcVar43 = s_TRAINING_00517a18;
    }
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,pcVar43);
    DAT_006c1060 = PTR_DAT_0051599c[0x14];
LAB_004747b4:
    uVar23 = 0;
    DAT_006214ac = puVar34;
    do {
      local_14[0] = s_0123456789012345_00517aa4[0xc];
      local_14[1] = s_0123456789012345_00517aa4[0xd];
      local_14[2] = s_0123456789012345_00517aa4[0xe];
      local_14[3] = s_0123456789012345_00517aa4[0xf];
      switch(PTR_DAT_00513210[0x2a4]) {
      case 1:
        pcVar43 = s_______Piste___00_00517ab8;
        break;
      case 2:
        pcVar43 = s_______Spur___00_00517ad4;
        break;
      case 3:
      case 4:
        pcVar43 = s_______Pista___00_00517af0;
        break;
      default:
        pcVar43 = s_______Track___00_00517b0c;
      }
      uStack_20 = *(undefined8 *)(puVar34 + 1);
      uVar4 = (undefined3)puVar34[3];
      uStack_18._3_1_ = SUB41(s_0123456789012345_00517aa4._8_4_,3);
      uStack_18._0_1_ = (char)uVar4;
      uStack_18._1_1_ = (char)((uint3)uVar4 >> 8);
      uStack_18._2_1_ = (char)((uint3)uVar4 >> 0x10);
      uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,&uStack_20);
      *(undefined4 *)((int)&DAT_006c110c + uVar23) = uVar18;
      if (DAT_006c1061 == '\v') {
        pcVar43[0x17] = (char)(*puVar34 / 10) + '0';
        cVar27 = (char)((ulonglong)*puVar34 % 10) + '0';
        pcVar43[0x18] = cVar27;
        if (*puVar34 < 10) {
          pcVar43[0x17] = cVar27;
          pcVar43[0x18] = ' ';
        }
        uVar18 = 4;
      }
      else {
        DAT_00517a98 = ((byte)(*puVar34 >> 0x14) & 0xf) + 0x30;
        DAT_00517a99 = (*(byte *)((int)puVar34 + 2) & 0xf) + 0x30;
        DAT_00517a9b = ((byte)(*puVar34 >> 0xc) & 0xf) + 0x30;
        DAT_00517a9c = ((byte)(*puVar34 >> 8) & 0xf) + 0x30;
        DAT_00517a9e = ((byte)(*puVar34 >> 4) & 0xf) + 0x30;
        pcVar43 = &DAT_00517a94;
        DAT_00517a9f = ((byte)*puVar34 & 0xf) + 0x30;
        uVar18 = 0xc;
      }
      uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,uVar18,0,pcVar43);
      *(undefined4 *)((int)&DAT_006c1120 + uVar23) = uVar18;
      uVar23 = uVar23 + 4;
      puVar34 = puVar34 + 4;
    } while (uVar23 < 0x14);
    break;
  case 0x10:
    FUN_00462100();
    DAT_0051237e = 1;
    FUN_0045fa90();
    FUN_0047b110(1);
    puVar26 = PTR_PTR_005159c0;
    _DAT_006c1300 = 0;
    PTR_PTR_005159c0[0x17] = 0x10;
    *(undefined2 *)(puVar26 + 0x1c) = 0x100;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_BEG_TEXT_005178dc);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_EXP_TEXT_005178e8);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MAS_TEXT_005178f4);
    DAT_006c110c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_PURS_TEXT_00517900);
    DAT_006c1110 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_ALLT_TEXT_0051790c);
    DAT_006c1114 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEMO1_TEXT_00517918);
    DAT_006c1118 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEMO2_TEXT_00517924);
    DAT_006c111c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_SURV_TEXT_00517930);
    DAT_006c1120 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_SOCC_TEXT_0051793c);
    DAT_006c1124 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH1_TEXT_00517948);
    DAT_006c1128 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH2_TEXT_00517954);
    DAT_006c112c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH3_TEXT_00517960);
    DAT_006c1130 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH4_TEXT_0051796c);
    DAT_006c1134 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_DEATH5_TEXT_00517978);
    DAT_006c1138 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MIRR_TEXT_00517984);
    DAT_006c113c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_MEGA_TEXT_00517990);
    DAT_006c1140 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_ATIMES_TEXT_0051799c);
    DAT_006c1144 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_CONGRATULATIONS_005179a8);
    DAT_006c1148 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_AWARDED_005179b8);
    DAT_006c114c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_AWARD_TYPE_II_005179c0);
    DAT_006c1150 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_AWARD_GENESIS_005179d0);
    if (DAT_006c0de3 != '\0') {
      if (DAT_00517ea4 != 'F') {
        DAT_00517ea4 = 'F';
        uVar21 = PTR_DAT_00513210[0x30];
        PTR_DAT_00513210[0x30] = 0x46;
        FUN_00430440();
        PTR_DAT_00513210[0x30] = uVar21;
        FUN_00454090();
        FUN_00478d80(extraout_ECX_00);
      }
      if (DAT_00517ea5 != 'I') {
        DAT_00517ea5 = 'I';
        uVar21 = PTR_DAT_00513210[0x31];
        PTR_DAT_00513210[0x31] = 0x49;
        FUN_00430440();
        PTR_DAT_00513210[0x31] = uVar21;
        FUN_00454090();
        FUN_00478d80(extraout_ECX_01);
      }
      if (DAT_00517ea6 != 'L') {
        DAT_00517ea6 = 'L';
        uVar21 = PTR_DAT_00513210[0x32];
        PTR_DAT_00513210[0x32] = 0x4c;
        FUN_00430440();
        PTR_DAT_00513210[0x32] = uVar21;
        FUN_00454090();
        FUN_00478d80(extraout_ECX_02);
      }
    }
    if (DAT_006c0de4 != '\0') {
      if (DAT_00517ea4 != '~') {
        DAT_00517ea4 = '~';
        uVar21 = PTR_DAT_00513210[0x30];
        PTR_DAT_00513210[0x30] = 0x7e;
        FUN_00430440();
        PTR_DAT_00513210[0x30] = uVar21;
        FUN_00454090();
        FUN_00478d80(extraout_ECX_03);
      }
      if (DAT_00517ea5 != '\x7f') {
        DAT_00517ea5 = '\x7f';
        uVar21 = PTR_DAT_00513210[0x31];
        PTR_DAT_00513210[0x31] = 0x7f;
        FUN_00430440();
        PTR_DAT_00513210[0x31] = uVar21;
        FUN_00454090();
        FUN_00478d80(extraout_ECX_04);
      }
    }
    break;
  case 0x11:
    DAT_0051237e = 1;
    *(undefined2 *)(PTR_PTR_005159c4 + 0x14) = 0;
    *(undefined4 *)(puVar5 + 8) = 0;
    _DAT_00515afc = 0;
    _DAT_00515af0 = 0;
    FUN_0045fa90();
    break;
  case 0x12:
    DAT_0051237e = 1;
    *(undefined2 *)(PTR_PTR_005159c8 + 0x14) = 0;
    *(undefined4 *)(puVar6 + 8) = 0;
    _DAT_00515afc = 0;
    _DAT_00515af0 = 0;
    FUN_0045fa90();
    break;
  case 0x13:
    DAT_0051237e = 1;
    FUN_0045fa90();
    _DAT_006c1300 = 0;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_GAME_OVER_005179e0);
    sVar12 = *(short *)(PTR_DAT_00513210 + 0x19b4);
    uVar18 = extraout_ECX_05;
    goto LAB_00471a1d;
  case 0x14:
    DAT_00517e60 = 0;
    DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_PRESS_START_005175f4);
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_LEGAL_TEXT_00517600);
    sVar12 = *(short *)(PTR_DAT_00513210 + 0x19b4);
    uVar18 = extraout_ECX;
LAB_00471a1d:
    FUN_00480150(0,0x1000,(int)sVar12,2,uVar18,0,0);
    break;
  case 0x15:
    FUN_0045fa90();
    FUN_0047ba80();
    _DAT_006c1300 = 0;
    DAT_006c0a00 = 0;
    DAT_006214ac = (uint *)FUN_0045ab80();
    iVar20 = 0;
    uVar23 = 0;
    do {
      local_14[0] = s_01234567890123456_00517b38[0x10];
      local_14[1] = s_01234567890123456_00517b38[0x11];
      local_24._0_1_ = s_01234567890123456_00517b38[0];
      local_24._1_1_ = s_01234567890123456_00517b38[1];
      local_24._2_1_ = s_01234567890123456_00517b38[2];
      local_24._3_1_ = s_01234567890123456_00517b38[3];
      uStack_20 = CONCAT44(s_01234567890123456_00517b38._8_4_,s_01234567890123456_00517b38._4_4_);
      uStack_18._0_1_ = s_01234567890123456_00517b38[0xc];
      uStack_18._1_1_ = s_01234567890123456_00517b38[0xd];
      uStack_18._2_1_ = s_01234567890123456_00517b38[0xe];
      uStack_18._3_1_ = s_01234567890123456_00517b38[0xf];
      switch(PTR_DAT_00513210[0x2a4]) {
      case 1:
        pcVar43 = s_______Piste___00_00517b4c;
        break;
      case 2:
        pcVar43 = s_______Spur___00_00517b68;
        break;
      case 3:
      case 4:
        pcVar43 = s_______Pista___00_00517b84;
        break;
      default:
        pcVar43 = s_______Track___00_00517ba0;
      }
      uVar28 = 0;
      do {
        *(byte *)((int)&local_24 + uVar28) = *(byte *)((int)DAT_006214ac + uVar28 + iVar20 + 4);
        uVar28 = uVar28 + 1;
      } while (uVar28 < 0xb);
      uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,&local_24);
      puVar34 = DAT_006214ac;
      bVar39 = DAT_006c1061 == '\v';
      *(undefined4 *)((int)&DAT_006c110c + uVar23) = uVar18;
      if (bVar39) {
        cVar27 = (char)(*(uint *)(iVar20 + (int)puVar34) / 10) + '0';
        pcVar43[0x17] = cVar27;
        cVar27 = *(byte *)(iVar20 + (int)puVar34) + cVar27 * -10 + '\x10';
        pcVar43[0x18] = cVar27;
        if (*(uint *)(iVar20 + (int)puVar34) < 10) {
          pcVar43[0x17] = cVar27;
          pcVar43[0x18] = ' ';
        }
        uVar18 = 4;
      }
      else {
        DAT_00517b2c = ((byte)(*(uint *)(iVar20 + (int)puVar34) >> 0x14) & 0xf) + 0x30;
        DAT_00517b2d = (*(byte *)(iVar20 + 2 + (int)puVar34) & 0xf) + 0x30;
        DAT_00517b2f = ((byte)(*(uint *)(iVar20 + (int)puVar34) >> 0xc) & 0xf) + 0x30;
        DAT_00517b30 = ((byte)((uint)*(undefined4 *)(iVar20 + (int)puVar34) >> 8) & 0xf) + 0x30;
        DAT_00517b32 = ((byte)(*(uint *)(iVar20 + (int)puVar34) >> 4) & 0xf) + 0x30;
        pcVar43 = &DAT_00517b28;
        DAT_00517b33 = (*(byte *)(iVar20 + (int)puVar34) & 0xf) + 0x30;
        uVar18 = 0xc;
      }
      uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,uVar18,0,pcVar43);
      *(undefined4 *)((int)&DAT_006c1120 + uVar23) = uVar18;
      uVar23 = uVar23 + 4;
      iVar20 = iVar20 + 0x10;
    } while (uVar23 < 0x14);
    FUN_0045d1a0(s_BEST_P1_00517bbc,0);
    pcVar43 = (char *)((int)&uStack_12d + 1);
    do {
      cVar27 = *pcVar43;
      pcVar43 = pcVar43 + 1;
    } while (cVar27 != '\0');
    if ((char *)0xff < pcVar43 + (-1 - ((int)&uStack_12d + 2))) {
                    /* WARNING: Subroutine does not return */
      ___report_rangecheckfailure();
    }
    (pcVar43 + (-1 - ((int)&uStack_12d + 2)))[(int)&uStack_12d + 1] = '\0';
    pcVar43 = &DAT_00517bc4;
    do {
      pcVar33 = pcVar43;
      pcVar43 = pcVar33 + 1;
    } while (*pcVar33 != '\0');
    puVar13 = &uStack_12d;
    do {
      pcVar43 = (char *)((int)puVar13 + 1);
      puVar13 = (undefined4 *)((int)puVar13 + 1);
    } while (*pcVar43 != '\0');
    puVar35 = (undefined4 *)&DAT_00517bc4;
    for (uVar23 = (uint)(pcVar33 + -0x517bc3) >> 2; uVar23 != 0; uVar23 = uVar23 - 1) {
      *puVar13 = *puVar35;
      puVar35 = puVar35 + 1;
      puVar13 = puVar13 + 1;
    }
    for (uVar23 = (uint)(pcVar33 + -0x517bc3) & 3; uVar23 != 0; uVar23 = uVar23 - 1) {
      *(undefined1 *)puVar13 = *(undefined1 *)puVar35;
      puVar35 = (undefined4 *)((int)puVar35 + 1);
      puVar13 = (undefined4 *)((int)puVar13 + 1);
    }
    FUN_004212a0((int)&uStack_275 + 1,(int)&uStack_12d + 1,DAT_006c0a0d);
    DAT_006c1134 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,(int)&uStack_275 + 1);
    local_388 = 0;
    uVar23 = 0;
    bVar11 = DAT_006c0a0d;
    do {
      puVar34 = DAT_006214ac;
      if (bVar11 == (&DAT_006c0a08)[local_388]) {
        if (PTR_DAT_00513214[0x1e] == '\x01') {
          pcVar43 = PTR_DAT_00513214 + (uint)bVar11 * 0xb + 0x75;
          iVar20 = uVar23 - (int)pcVar43;
          do {
            cVar27 = *pcVar43;
            pcVar43 = pcVar43 + 1;
            pcVar43[(int)((int)puVar34 + iVar20 + 3)] = cVar27;
          } while (cVar27 != '\0');
        }
        else {
          pcVar43 = PTR_DAT_00513214 + (uint)bVar11 * 0xb + 0xad5;
          iVar20 = uVar23 - (int)pcVar43;
          do {
            cVar27 = *pcVar43;
            pcVar43 = pcVar43 + 1;
            pcVar43[(int)((int)puVar34 + iVar20 + 3)] = cVar27;
          } while (cVar27 != '\0');
        }
        FUN_0045ade0(0xb,_DAT_006c0b60,&DAT_0060e3a8);
        bVar11 = DAT_006c0a0d;
      }
      local_388 = local_388 + 1;
      uVar23 = uVar23 + 0x10;
    } while (uVar23 < 0x50);
    break;
  case 0x16:
    uVar18 = FUN_00462100();
    DAT_0051237e = 1;
    if (DAT_00515714 == '\0') {
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517044,4,0,s_PASSWORD_IS_00517888);
      pcVar43 = s_PASSWORD_GIVE_00517894;
    }
    else {
      DAT_006c1100 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517044,4,0,s_ENTER_PASSWORD_005178a4);
      pcVar43 = s_PASSWORD_TEXT_005178b4;
    }
    FUN_00461c20(0x50,pcVar43,DAT_00517034,0);
    _DAT_006c1300 = 1;
    DAT_006c1104 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517038,4,0,s_PASS_ACCEPT_005178c4);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_PASS_REJECT_005178d0);
    DAT_006c110c = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,&DAT_00517884);
    DAT_006c1110 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,&DAT_00517884);
    DAT_006c1114 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,&DAT_00517884);
    DAT_006c1118 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,uVar18);
    FUN_0045fa90();
    _DAT_006214b0 = 0x7f7f7f7f;
    uRam006214b4 = 0x7f7f7f7f;
    uRam006214b8 = 0x7f7f7f7f;
    uRam006214bc = 0x7f7f7f7f;
    DAT_006c0a00 = 0;
    _DAT_006214c0 = _DAT_006214b0;
    uRam006214c4 = uRam006214b4;
    uRam006214c8 = uRam006214b8;
    uRam006214cc = uRam006214bc;
    break;
  case 0x17:
    DAT_0051237e = 4;
    DAT_006c105c = &DAT_006c0b20;
    _DAT_006c140c = PTR_DAT_00513210 + 0x19bc;
    PTR_PTR_005159dc[0x32] = 2;
    _DAT_006c13e4 = 0x701;
    DAT_006c13e6 = '\n';
    DAT_006c13e7 = *_DAT_006c140c;
    DAT_006c1438 = puVar26 + 0x19be;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x30201);
    _DAT_006c1464 = puVar26 + 0x19bf;
    _DAT_006c143c = 0x201;
    DAT_006c143e = 3;
    DAT_006c143f = *_DAT_006c1464;
    _DAT_006c1490 = puVar26 + 0x2bf;
    _DAT_006c1468 = 0x201;
    DAT_006c146a = 3;
    DAT_006c146b = *_DAT_006c1490;
    _DAT_006c14bc = puVar26 + 0x19bd;
    _DAT_006c1494 = 0x201;
    DAT_006c1496 = 3;
    DAT_006c1497 = *_DAT_006c14bc;
    if ((puVar26[0x401] & 4) != 0) {
      puVar7[0x35] = 2;
    }
    if ((puVar26[0x401] & 8) != 0) {
      puVar7[0x36] = 2;
    }
    FUN_0045fa90();
    break;
  case 0x18:
    DAT_0051237e = 4;
    FUN_0045fa90();
    break;
  case 0x19:
    DAT_0051237e = 4;
    *(undefined4 *)(PTR_PTR_005159e4 + 8) = 0;
    *(undefined2 *)(puVar8 + 0x14) = 0;
    DAT_006c1362 = '\0';
    _DAT_006c1360 = 3;
    DAT_006c1388 = puVar24 + (uint)DAT_006c1048 * 0x288 + 0xc28;
    DAT_006c1363 = *DAT_006c1388;
    DAT_006c13b4 = puVar24 + (uint)DAT_006c1048 * 0x288 + 0xc26;
    _DAT_006c138c = 0x1e01;
    DAT_006c138e = 0x1f;
    DAT_006c138f = *DAT_006c13b4;
    FUN_0045fa90();
    FUN_004792d0();
    uVar23 = 0;
    do {
      if ((&DAT_004f25c8)[uVar23] == 0x800) goto LAB_004723d5;
      uVar23 = uVar23 + 1;
    } while (uVar23 < 0x1b);
    uVar23 = 0;
LAB_004723d5:
    bVar39 = DAT_006c1048 != 0;
    puVar8[uVar23 + 0x31] = 2;
    if (bVar39) {
      uVar23 = 0;
      do {
        if ((&DAT_004f25c8)[uVar23] == 0x100000) break;
        uVar23 = uVar23 + 1;
      } while (uVar23 < 0x1b);
      uVar42 = FUN_0045eda0();
      uVar23 = (uint)((ulonglong)uVar42 >> 0x20);
      if (uVar23 <= (uint)uVar42) {
        uVar28 = ((uint)uVar42 - uVar23) + 1;
        puVar13 = (undefined4 *)(puVar8 + uVar23 + 0x31);
        for (uVar19 = uVar28 >> 2; uVar19 != 0; uVar19 = uVar19 - 1) {
          *puVar13 = 0x2020202;
          puVar13 = puVar13 + 1;
        }
        for (uVar28 = uVar28 & 3; uVar28 != 0; uVar28 = uVar28 - 1) {
          *(undefined1 *)puVar13 = 2;
          puVar13 = (undefined4 *)((int)puVar13 + 1);
        }
      }
    }
    FUN_0046ccf0();
    break;
  case 0x1a:
    _DAT_006c140c = PTR_DAT_00513214 + 0x1658;
    _DAT_006c1360 = 0x804;
    DAT_006c1362 = ' ';
    DAT_006c1388 = PTR_DAT_00513214 + 0x1644;
    DAT_0051237e = 4;
    DAT_006c1363 = *DAT_006c1388;
    _DAT_006c138c = 0x201;
    DAT_006c138e = 3;
    DAT_006c138f = *_DAT_006c140c;
    _DAT_006c13e0 = (undefined4 *)(PTR_DAT_00513214 + 0x164c);
    DAT_006c1390 = 7;
    DAT_006c13b4 = _DAT_006c140c;
    PTR_PTR_005159e8[0x30] = 2;
    _DAT_006c13b8 = 0x201;
    DAT_006c13ba = 3;
    DAT_006c13bb = *(undefined1 *)_DAT_006c13e0;
    puVar9[0x31] = 2;
    _DAT_006c13e4 = 0x3601;
    DAT_006c13e6 = '8';
    DAT_006c13e7 = *_DAT_006c140c;
    _DAT_006c13e8 = 7;
    puVar9[0x32] = 2;
    FUN_0045fa90();
    s_RSIIActionReplay_arf_0051237f[0] = '\x02';
    break;
  case 0x1b:
    puVar26 = PTR_PTR_005159ec + 0x2f;
    DAT_0051237e = 4;
    local_39c = (byte *)&DAT_006c1362;
    *puVar26 = DAT_00621890 == 0;
    DAT_006c1388 = puVar24 + 0x44;
    _DAT_006c1360 = 3;
    DAT_006c1362 = '\0';
    DAT_006c1363 = *DAT_006c1388;
    DAT_006c13b4 = puVar24 + 0x3c;
    _DAT_006c138c = 3;
    DAT_006c138e = 0;
    DAT_006c138f = *DAT_006c13b4;
    _DAT_006c13b8 = 3;
    DAT_006c13ba = 0;
    _DAT_006c13e0 = &DAT_006c104c;
    _DAT_006c13e4 = 0x901;
    DAT_006c13e6 = '\n';
    DAT_006c104c = *(int *)(puVar24 + 0x40) * 0x48e6 + 0xfdc67b20U >> 0xe;
    DAT_006c13bb = (undefined1)DAT_006c104c;
    _DAT_006c140c = puVar24 + 0x25;
    DAT_006c13e7 = *_DAT_006c140c;
    DAT_006c1438 = puVar24 + 0x1d;
    _DAT_006c13e8 = 1;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x1a1801);
    _DAT_006c143c = 0x1b01;
    DAT_006c143e = 0x1d;
    local_390 = (char *)0x6;
    _DAT_006c1414 = ~((DAT_00696e40 & 2) * 2 | 1);
    _DAT_006c1464 = puVar24 + 9;
    DAT_006c143f = *_DAT_006c1464;
    _DAT_006c1440 = 3;
    do {
      if (local_39c[-2] == 1) {
        uVar23 = 0;
        if (-1 < (int)((uint)*local_39c - (uint)local_39c[-1])) {
          uVar28 = 0;
          do {
            bVar11 = (byte)uVar28;
            bVar30 = (char)(uVar23 >> 8) + 1;
            uVar28 = (uint)bVar30;
            cVar27 = (char)uVar23 + '\x01';
            if ((1 << (bVar11 & 0x1f) & *(uint *)(local_39c + 2)) != 0) {
              cVar27 = (char)uVar23;
            }
            uVar23 = (uint)CONCAT11(bVar30,cVar27);
          } while ((int)uVar28 <= (int)((uint)*local_39c - (uint)local_39c[-1]));
        }
        *puVar26 = (byte)uVar23 < 2;
        if ((byte)uVar23 != 0) {
          uVar23 = *(uint *)(local_39c + 2) & 1 << (**(byte **)(local_39c + 0x26) & 0x1f);
          while (uVar23 != 0) {
            **(char **)(local_39c + 0x26) = **(char **)(local_39c + 0x26) + '\x01';
            if ((int)((uint)*local_39c - (uint)local_39c[-1]) <
                (int)(uint)**(byte **)(local_39c + 0x26)) {
              **(byte **)(local_39c + 0x26) = 0;
            }
            uVar23 = *(uint *)(local_39c + 2) & 1 << (**(byte **)(local_39c + 0x26) & 0x1f);
          }
          local_39c[1] = **(byte **)(local_39c + 0x26);
        }
      }
      puVar26 = puVar26 + 1;
      local_39c = local_39c + 0x2c;
      local_390 = (char *)((int)local_390 + -1);
    } while (local_390 != (char *)0x0);
    FUN_0045fa90();
    FUN_004792d0();
    break;
  case 0x1c:
    bVar39 = DAT_005192b8 != 2;
    PTR_DAT_00513210[0x2d1] = 0;
    puVar24[0x1e] = 0;
    puVar24 = PTR_PTR_005159f0;
    if (bVar39) {
      *(undefined2 *)(PTR_PTR_005159f0 + 0x2f) = 0x101;
      puVar24[0x31] = 1;
    }
    puVar24[0x32] = 1;
    puVar24[0x17] = 0;
    PTR_PTR_005159a8 = (undefined *)&PTR_s_CONFIRM_00516768;
    iVar20 = 5;
    DAT_006c1069 = 1;
    DAT_0051237e = 2;
    puVar36 = puVar26 + 0x4d;
    do {
      puVar36[0x227] = 0;
      *puVar36 = 0;
      iVar20 = iVar20 + -1;
      puVar36 = puVar36 + 1;
    } while (iVar20 != 0);
    FUN_0045fa90();
    break;
  case 0x1e:
    bVar39 = DAT_005192b8 != 2;
    PTR_DAT_00513214[0x1e] = 1;
    if (bVar39) {
      puVar32[0x2f] = 1;
    }
    puVar32[0x17] = 0;
    *(undefined2 *)(puVar32 + 0x1c) = 0x400;
    DAT_006c1069 = 1;
    DAT_0051237e = 2;
    if (DAT_00669cc0 != (int *)0x0) {
      FUN_004b3ee0();
      (**(code **)(*DAT_00669cc0 + 0x10))(DAT_00669cc0);
      puVar24 = PTR_DAT_00513214;
      puVar32 = PTR_PTR_005159f8;
    }
    if (DAT_00621788 == 0) {
      puVar24[0x27] = 0;
    }
    puVar26 = PTR_DAT_00513210;
    if (puVar24[0x27] == '\x01') {
      DAT_006c1063 = puVar24[0x23];
      cVar27 = puVar24[0x20];
      DAT_006c1060 = puVar24[0x24];
      DAT_006c106a = puVar24[0x21];
      DAT_006c1062 = puVar24[0x2b];
      _DAT_006c1064 = CONCAT11(DAT_006c1065,puVar24[0x22]);
    }
    else {
      cVar27 = -1;
    }
    iVar20 = 5;
    puVar36 = PTR_DAT_00513210 + 0x4d;
    DAT_006c1061 = cVar27;
    do {
      puVar36[0x227] = 0;
      *puVar36 = 0;
      iVar20 = iVar20 + -1;
      puVar36 = puVar36 + 1;
    } while (iVar20 != 0);
    if (cVar27 == '\f') {
      puVar26[0x27a] = 0;
      DAT_006c106a = 0;
    }
    puVar32[0x33] = 1;
    _DAT_006c1464 = puVar24 + 0x1c;
    _DAT_006c1410 = 0x30201;
    DAT_006c1438 = (undefined1 *)0x0;
    _DAT_006c143c = 0x1001;
    DAT_006c143e = 0x12;
    DAT_006c143f = *_DAT_006c1464;
    FUN_0045ade0(0xb,_DAT_006c0b60,&DAT_00517030);
    FUN_0045fa90();
    break;
  case 0x1f:
    _DAT_006c138c = 0x1401;
    DAT_006c138e = 0x15;
    DAT_006c13b4 = PTR_DAT_00513214 + 0x1f;
    DAT_006c138f = *DAT_006c13b4;
    _DAT_006c13e0 = (undefined4 *)(PTR_DAT_00513214 + 0x13);
    _DAT_006c13b8 = 0x901;
    DAT_006c13ba = 10;
    DAT_006c13bb = *(undefined1 *)_DAT_006c13e0;
    _DAT_006c140c = PTR_DAT_00513214 + 0x33;
    _DAT_006c13e4 = 0x1601;
    DAT_006c13e6 = '\x17';
    DAT_006c13e7 = *_DAT_006c140c;
    DAT_006c1438 = PTR_DAT_00513214 + 0x2a;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x30004);
    goto LAB_0047267f;
  case 0x20:
LAB_0047267f:
    DAT_0051237e = 2;
LAB_00472688:
    FUN_0045ade0(0x33,_DAT_006c0b60,&DAT_00517030);
LAB_0047269d:
    FUN_0045fa90();
    break;
  case 0x21:
    DAT_0051237e = 2;
    FUN_0045fa90();
    break;
  case 0x22:
    _DAT_006c1360 = 0x2701;
    DAT_006c1362 = '*';
    DAT_0051237e = 2;
    DAT_006c1388 = PTR_DAT_00513214 + 0x18;
    DAT_006c1363 = *DAT_006c1388;
    DAT_006c13b4 = PTR_DAT_00513214 + 0x19;
    _DAT_006c138c = 0x3201;
    DAT_006c138e = 0x35;
    DAT_006c138f = *DAT_006c13b4;
    _DAT_006c13e0 = (undefined4 *)(PTR_DAT_00513214 + 0x1b);
    _DAT_006c13b8 = 0x2b01;
    DAT_006c13ba = 0x2f;
    DAT_006c13bb = *(undefined1 *)_DAT_006c13e0;
    _DAT_006c140c = PTR_DAT_00513214 + 0x16;
    _DAT_006c13e4 = 0x2201;
    DAT_006c13e6 = '&';
    DAT_006c13e7 = *_DAT_006c140c;
    DAT_006c1438 = PTR_DAT_00513214 + 0x1a;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x313001);
    FUN_0045fa90();
    break;
  case 0x23:
    DAT_0051237e = 2;
    FUN_00463910();
    FUN_004b4090();
    uVar23 = 0x20;
    if ((int)DAT_0068da90 < 0x20) {
      uVar23 = DAT_0068da90;
    }
    iVar20 = 0;
    if (0 < (int)uVar23) {
      puVar36 = &DAT_0068da94;
      do {
        auStack_ac[iVar20] = puVar36;
        iVar20 = iVar20 + 1;
        puVar36 = puVar36 + 0x40;
      } while (iVar20 < (int)uVar23);
    }
    FUN_0045d1a0(s_PC_FLOW_CTRL_NONE_00517658,0);
    pcVar33 = PTR_DAT_00513214 + 0xb7d;
    pcVar43 = local_16a;
    do {
      cVar27 = *pcVar43;
      pcVar43 = pcVar43 + 1;
      pcVar43[(int)(pcVar33 + (-1 - (int)local_16a))] = cVar27;
    } while (cVar27 != '\0');
    DAT_006c1388 = PTR_DAT_00513214 + 0x11;
    if (uVar23 <= (byte)PTR_DAT_00513214[0x11]) {
      *DAT_006c1388 = 0;
    }
    if (uVar23 == 0) {
      uVar23 = 1;
      DAT_00640ae8 = pcVar33;
      PTR_PTR_00515a0c[0x2f] = 1;
    }
    else {
      pcVar43 = (char *)auStack_ac[*DAT_006c1388];
      pcVar25 = pcVar43;
      do {
        cVar27 = *pcVar25;
        pcVar25 = pcVar25 + 1;
      } while (cVar27 != '\0');
      if ((uint)((int)pcVar25 - (int)(pcVar43 + 1)) < 0x33) {
        do {
          cVar27 = *pcVar43;
          pcVar43 = pcVar43 + 1;
          *pcVar33 = cVar27;
          pcVar33 = pcVar33 + 1;
        } while (cVar27 != '\0');
      }
      uVar28 = 0;
      if (uVar23 != 0) {
        do {
          if (uVar28 < 0x20) {
            (&DAT_00640ae8)[uVar28] = (char *)auStack_ac[uVar28];
          }
          uVar28 = uVar28 + 1;
        } while (uVar28 < uVar23);
      }
    }
    DAT_006c1362 = (char)uVar23 + 'c';
    _DAT_006c1360 = 0x6401;
    DAT_006c1363 = *DAT_006c1388;
    goto LAB_00472688;
  case 0x24:
    DAT_0051237e = 2;
    DAT_006c1050 = 0;
    FUN_004b5fa0();
    FUN_0047aca0();
    DAT_006c1100 = FUN_0045cbc0(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,local_37c);
    FUN_0045d080(DAT_006c1100,_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,&DAT_0051766c);
    cVar27 = DAT_006c1061;
    puVar24 = PTR_DAT_00513214;
    puVar26 = PTR_DAT_00513210;
    PTR_DAT_00513214[0x23] = DAT_006c1063;
    puVar24[0x24] = DAT_006c1060;
    puVar24[0x21] = DAT_006c106a;
    puVar24[0x2b] = DAT_006c1062;
    puVar24[0x22] = DAT_006c1064;
    puVar24[0x32] = 1;
    puVar24[0x27] = 1;
    puVar24[0x20] = cVar27;
    _DAT_006c13e4 = 0x401;
    DAT_006c13e6 = ((byte)puVar26[0x401] >> 4 & 3) + 4;
    _DAT_006c140c = puVar26 + 0x2b9;
    DAT_006c13e7 = *_DAT_006c140c;
    switch(cVar27) {
    case '\x01':
    case '\x03':
    case '\x06':
    case '\a':
    case '\b':
    case '\t':
    case '\v':
    case '\r':
    case '\x0f':
      PTR_PTR_00515a10[0x33] = 2;
    }
    DAT_006c1438 = puVar26 + 0x19da;
    _DAT_006c1410 = CONCAT13(*DAT_006c1438,0x620004);
    FUN_0045ade0(0x33,_DAT_006c0b60,&DAT_00517030);
    FUN_0045fa90();
    FUN_0046cd90();
    puVar26 = PTR_PTR_00515a10;
    PTR_PTR_00515a10[0x17] = 0x1e;
    *(undefined2 *)(puVar26 + 0x1c) = 0x300;
    break;
  case 0x25:
    DAT_0051237e = 2;
    DAT_006c1050 = 0;
    FUN_0047aca0();
    DAT_006c1100 = FUN_0045cbc0(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,local_37c);
    FUN_0045d080(DAT_006c1100,_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,&DAT_00517670);
    uVar23 = _DAT_006c0b60;
    puVar26 = PTR_DAT_00513214;
    uVar21 = DAT_006c1064;
    PTR_DAT_00513214[0x32] = 0;
    puVar26[0x27] = 1;
    puVar26[0x22] = uVar21;
    FUN_0045ade0(0x33,uVar23,&DAT_00517030);
    FUN_0045fa90();
    FUN_0046cd90();
    puVar26 = PTR_PTR_00515a14;
    PTR_PTR_00515a14[0x17] = 0x1e;
    *(undefined2 *)(puVar26 + 0x1c) = 0x300;
    break;
  case 0x26:
  case 0x27:
    DAT_0051237e = 2;
    FUN_0047aca0();
    if (in_CL == 0x26) {
      FUN_004b5ed0();
    }
    DAT_006c1100 = FUN_0045cbc0(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,local_37c);
    FUN_0045d080(DAT_006c1100,_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,&DAT_00517674);
    FUN_0045fa90();
    FUN_0046cd90();
    break;
  case 0x28:
    DAT_0051237e = 2;
    DAT_006c1061 = -1;
    PTR_PTR_005159a8 = (undefined *)&PTR_s_PC_NETWORK_JOIN_CONFIRM_00515b88;
    *(undefined2 *)(PTR_PTR_00515a20 + 0x50) = 0x529;
    FUN_0045fa90();
    FUN_0045d1a0(s_SEARCHING_SESSIONS_00517678,0);
    DAT_006c1100 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,(int)&uStack_12d + 1);
    FUN_0045d1a0(s_SEARCHING_SESSIONS_0051768c,1);
    FUN_004212a0((int)&uStack_275 + 1,(int)&uStack_12d + 1,0);
    pcVar43 = &DAT_005176a0;
    do {
      pcVar33 = pcVar43;
      pcVar43 = pcVar33 + 1;
    } while (*pcVar33 != '\0');
    puVar13 = &uStack_275;
    do {
      pcVar43 = (char *)((int)puVar13 + 1);
      puVar13 = (undefined4 *)((int)puVar13 + 1);
    } while (*pcVar43 != '\0');
    puVar35 = (undefined4 *)&DAT_005176a0;
    for (uVar23 = (uint)(pcVar33 + -0x51769f) >> 2; uVar23 != 0; uVar23 = uVar23 - 1) {
      *puVar13 = *puVar35;
      puVar35 = puVar35 + 1;
      puVar13 = puVar13 + 1;
    }
    for (uVar23 = (uint)(pcVar33 + -0x51769f) & 3; uVar23 != 0; uVar23 = uVar23 - 1) {
      *(undefined1 *)puVar13 = *(undefined1 *)puVar35;
      puVar35 = (undefined4 *)((int)puVar35 + 1);
      puVar13 = (undefined4 *)((int)puVar13 + 1);
    }
    DAT_006c1104 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,(int)&uStack_275 + 1);
    break;
  case 0x29:
    uVar28 = 0;
    DAT_0051237e = 2;
    if (DAT_0060e390 != 0) {
      puVar16 = (undefined2 *)(PTR_PTR_00515a24 + 0x50);
      do {
        *puVar16 = 0x525;
        puVar16 = puVar16 + 1;
        puVar10[uVar28 + 0x2f] = (&DAT_00660b88)[uVar28] != 0;
        uVar28 = uVar28 + 1;
      } while (uVar28 < uVar23);
    }
    *(undefined2 *)(puVar10 + uVar28 * 2 + 0x50) = 0x131e;
    puVar10[uVar28 + 0x2f] = 0;
    uVar28 = uVar28 + 1;
    if (uVar28 < 0x20) {
      puVar16 = (undefined2 *)(puVar10 + uVar28 * 2 + 0x50);
      do {
        puVar10[uVar28 + 0x2f] = 0;
        uVar28 = uVar28 + 1;
        *puVar16 = 0x100;
        puVar16 = puVar16 + 1;
      } while (uVar28 < 0x20);
      FUN_0045fa90();
      break;
    }
    goto LAB_0047269d;
  case 0x2a:
    DAT_0051237e = 2;
    uVar23 = 0;
    do {
      FUN_0045ade0(0x33,_DAT_006c0b60,&DAT_00517030);
      uVar23 = uVar23 + 0x33;
    } while (uVar23 < 0x1fe);
    FUN_0045fa90();
    break;
  case 0x2b:
    DAT_0051237e = 2;
    uVar23 = 0;
    do {
      FUN_0045ade0(0x33,_DAT_006c0b60,&DAT_00517030);
      uVar23 = uVar23 + 0x66;
    } while (uVar23 < 0x792);
    FUN_0045fa90();
    break;
  case 0x2c:
    DAT_0051237e = 2;
    uVar23 = 0;
    do {
      FUN_0045ade0(0x33,_DAT_006c0b60,&DAT_00517030);
      uVar23 = uVar23 + 0x66;
    } while (uVar23 < 0x792);
    FUN_0045fa90();
    break;
  case 0x2d:
    DAT_006c1069 = 1;
    DAT_0051237e = 2;
    DAT_006c1061 = PTR_DAT_00513214[0x20];
    DAT_006c1063 = PTR_DAT_00513214[0x23];
    DAT_006c1060 = PTR_DAT_00513214[0x24];
    DAT_006c106a = PTR_DAT_00513214[0x21];
    DAT_006c1062 = PTR_DAT_00513214[0x2b];
    _DAT_006c1064 = CONCAT11(DAT_006c1065,PTR_DAT_00513214[0x22]);
    ppuVar15 = &PTR_s_PC_NETWORK_START_CONFIRM_00515520;
    if (PTR_DAT_00513214[0x32] != '\x01') {
      ppuVar15 = &PTR_s_PC_NETWORK_JOIN_CONFIRM_00515b88;
    }
    PTR_DAT_00513214[0x1e] = 1;
    PTR_PTR_005159a8 = (undefined *)ppuVar15;
    PTR_PTR_005159f8[0x17] = 0;
    FUN_0045fa90();
    if (PTR_DAT_00513214[0x32] == '\x01') {
      uVar18 = 6;
      pcVar43 = s_SEARCHING_SESSIONS_005176a8;
    }
    else {
      uVar18 = 5;
      pcVar43 = s_SEARCHING_SESSIONS_005176bc;
    }
    FUN_0045d1a0(pcVar43,uVar18);
    DAT_006c1100 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,(int)&uStack_275 + 1);
    memset((void *)((int)&uStack_275 + 1),0x2d,0x100);
    local_175 = 0;
    DAT_006c1104 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,(int)&uStack_275 + 1);
    break;
  case 0x2e:
    local_394 = (undefined4 *)_DAT_006c0b60;
    local_388 = _DAT_006c0b54;
    DAT_0051237e = 1;
    DAT_006c1050 = 0;
    _DAT_006c0de0 = 0;
    DAT_006c0de4 = '\0';
    FUN_0047a3b0();
    FUN_0045fa90();
    bVar11 = DAT_006c1069;
    puVar24 = PTR_PTR_00515a38;
    puVar26 = PTR_DAT_00513210;
    _DAT_006c1300 = 0;
    *(undefined2 *)(PTR_PTR_00515a38 + 0x14) = 0;
    *(undefined4 *)(puVar24 + 8) = 0;
    puVar24[0x17] = 0x2e;
    *(undefined2 *)(puVar24 + 0x1c) = 0x100;
    DAT_00515aff = 0x2e;
    _DAT_00515b04 = 0x100;
    *(undefined2 *)(puVar24 + 0x30) = 2;
    puVar24[0x32] = 2;
    if (((puVar26[0x280] != '\b') && (puVar26[0x280] != '\t')) &&
       ((PTR_DAT_00513214[0x1e] == '\x01' || (2 < bVar11)))) {
      local_394 = (undefined4 *)_DAT_006c0b58;
      local_388 = _DAT_006c0b58;
      if (PTR_DAT_00513214[0x1e] == '\x01') {
        puVar24[0x31] = 2;
      }
    }
    _DAT_00515afc = 0;
    _DAT_00515af0 = 0;
    DAT_0060e377 = 0;
    DAT_0060e376 = 0;
    _DAT_006c0d60 = 0xff;
    DAT_006c0dd4 = 0xff;
    DAT_006c0dec = 0xff;
    DAT_006c1044 = 0xff;
    switch(puVar26[0x280]) {
    case 1:
      goto switchD_00474d05_caseD_1;
    case 2:
    case 7:
      goto switchD_00474d05_caseD_2;
    case 3:
    case 8:
    case 9:
      puVar24[0x31] = 2;
switchD_00474d05_caseD_2:
      if (DAT_006c0dce == '\0') {
        FUN_00471760();
        DAT_006c0dce = '\x01';
      }
      break;
    case 4:
      *(undefined2 *)(puVar24 + 0x14) = 0;
      *(undefined2 *)(puVar24 + 0x2f) = 0x200;
      break;
    case 6:
      DAT_006c0dd0 = 0;
      if ((*(uint *)(puVar26 + 0x124) <= *(uint *)(puVar26 + 0x25c)) &&
         (DAT_006c0dd0 = 1, DAT_006c0dce == '\0')) {
        if (((byte)puVar26[0x402] < 0x19) &&
           ((uint)(byte)puVar26[0x402] == (byte)puVar26[0x2ac] - 0x13)) {
          puVar26[0x402] = puVar26[0x402] + '\x01';
        }
LAB_00474d52:
        DAT_006c0dce = '\x01';
      }
      goto switchD_00474d05_caseD_1;
    case 0xb:
      if (DAT_006c0dce == '\0') {
        puVar26[0x274] = puVar26[0x274] + '\x01';
        DAT_006c0dce = '\x01';
      }
      break;
    case 0xc:
      if (DAT_006c0dce == '\0') {
        uVar23 = 0xffffffff;
        iVar20 = 0;
        iVar17 = 0;
        if (bVar11 != 0) {
          do {
            if ((byte)puVar26[iVar17 + 6] < uVar23) {
              uVar23 = (uint)(byte)puVar26[iVar17 + 6];
              iVar20 = iVar17;
            }
            iVar17 = iVar17 + 1;
          } while (iVar17 < (int)(uint)bVar11);
        }
        puVar26[iVar20 + 0x274] = puVar26[iVar20 + 0x274] + '\x01';
        puVar26[iVar20 + 0x4d] = puVar26[iVar20 + 0x4d] + '\x01';
        puVar26[0x27a] = puVar26[0x27a] + '\x01';
        DAT_006c0dce = '\x01';
      }
      break;
    case 0xd:
      if (((byte)puVar26[0x40d] < 2) || (puVar26[6] == '\x01')) {
        *(undefined2 *)(puVar24 + 0x14) = 0;
        *(undefined2 *)(puVar24 + 0x2f) = 0x200;
        puVar24[0x33] = 2;
      }
      else {
        *(undefined2 *)(puVar24 + 0x14) = 1;
        *(undefined2 *)(puVar24 + 0x2f) = 2;
      }
      break;
    case 0xe:
      if (*(uint *)(puVar26 + 0x25c) < *(uint *)(puVar26 + 0x124)) {
        DAT_006c0dd0 = 0;
      }
      else {
        DAT_006c0dd0 = 1;
        if (DAT_006c0dce == '\0') {
          if (((puVar26[0x404] & 0xf) < 10) &&
             (((byte)puVar26[0x404] & 0xf) == (byte)puVar26[0x2ac] - 0x2c)) {
            bVar11 = puVar26[0x404];
            puVar26[0x404] = (bVar11 + 1 ^ bVar11) & 0xf ^ bVar11;
          }
          goto LAB_00474d52;
        }
      }
switchD_00474d05_caseD_1:
      puVar24[0x31] = 2;
    }
    local_10 = (uint)DAT_006c1069;
    uVar23 = 0;
    if (local_10 != 0) {
      local_390 = PTR_DAT_00517e18;
      puVar36 = &DAT_006c0c05;
      local_398 = &DAT_006c0b85;
      local_39c = PTR_DAT_00513210 + 0xe4;
      local_3a4 = (uint *)(PTR_DAT_00513210 + 0x128);
      local_3a0 = (undefined4 *)(PTR_DAT_00513210 + 0x130);
      puVar26 = PTR_DAT_00513210;
      do {
        puVar24 = PTR_DAT_00513210;
        *local_390 = (byte)puVar26[uVar23 + 0x4d] / 10 + 0x30;
        local_390[1] = (byte)puVar24[uVar23 + 0x4d] % 10 + 0x30;
        PTR_s_0___1___2___3___4_00517e14[uVar23 * 4] = puVar24[uVar23 + 0x274] + '0';
        local_398[-5] = ((byte)(*local_3a4 >> 0x14) & 0xf) + 0x30;
        bVar11 = *(byte *)((int)local_3a4 + 2);
        local_398[-3] = 0x3a;
        local_398[-4] = (bVar11 & 0xf) + 0x30;
        local_398[-2] = ((byte)(*local_3a4 >> 0xc) & 0xf) + 0x30;
        uVar28 = *local_3a4;
        *local_398 = 0x3a;
        local_398[-1] = ((byte)(uVar28 >> 8) & 0xf) + 0x30;
        local_398[1] = ((byte)(*local_3a4 >> 4) & 0xf) + 0x30;
        uVar28 = *local_3a4;
        local_398[3] = 0;
        local_398[2] = ((byte)uVar28 & 0xf) + 0x30;
        if ((undefined *)*local_3a4 == &DAT_00595999) {
          *(undefined2 *)(local_398 + 1) = 0x2d2d;
          *(undefined2 *)(local_398 + -2) = 0x2d2d;
          *(undefined2 *)(local_398 + -5) = 0x2d2d;
        }
        puVar26 = (undefined *)local_3a0[-1];
        puVar36[-3] = 0x3a;
        *puVar36 = 0x3a;
        puVar36[-5] = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
        puVar36[3] = 0;
        puVar36[-4] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
        puVar36[-2] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
        puVar36[-1] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
        puVar36[1] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
        puVar36[2] = ((byte)puVar26 & 0xf) + 0x30;
        if (puVar26 == &DAT_00595999) {
          *(undefined2 *)(puVar36 + 1) = 0x2d2d;
          *(undefined2 *)(puVar36 + -2) = 0x2d2d;
          *(undefined2 *)(puVar36 + -5) = 0x2d2d;
        }
        puVar26 = (undefined *)*local_3a0;
        puVar36[0xb] = 0x3a;
        puVar36[0xe] = 0x3a;
        puVar36[0x11] = 0;
        puVar36[9] = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
        puVar36[10] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
        puVar36[0xc] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
        puVar36[0xd] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
        puVar36[0xf] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
        puVar36[0x10] = ((byte)puVar26 & 0xf) + 0x30;
        if (puVar26 == &DAT_00595999) {
          *(undefined2 *)(puVar36 + 0xf) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0xc) = 0x2d2d;
          *(undefined2 *)(puVar36 + 9) = 0x2d2d;
        }
        puVar26 = (undefined *)local_3a0[1];
        puVar36[0x19] = 0x3a;
        puVar36[0x1c] = 0x3a;
        puVar36[0x1f] = 0;
        puVar36[0x17] = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
        puVar36[0x18] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
        puVar36[0x1a] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
        puVar36[0x1b] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
        puVar36[0x1d] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
        puVar36[0x1e] = ((byte)puVar26 & 0xf) + 0x30;
        if (puVar26 == &DAT_00595999) {
          *(undefined2 *)(puVar36 + 0x1d) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x1a) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x17) = 0x2d2d;
        }
        puVar26 = (undefined *)local_3a4[4];
        puVar36[0x27] = 0x3a;
        puVar36[0x2a] = 0x3a;
        puVar36[0x2d] = 0;
        puVar36[0x25] = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
        puVar36[0x26] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
        puVar36[0x28] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
        puVar36[0x29] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
        puVar36[0x2b] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
        puVar36[0x2c] = ((byte)puVar26 & 0xf) + 0x30;
        if (puVar26 == &DAT_00595999) {
          *(undefined2 *)(puVar36 + 0x2b) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x28) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x25) = 0x2d2d;
        }
        puVar26 = (undefined *)local_3a0[3];
        puVar36[0x35] = 0x3a;
        puVar36[0x38] = 0x3a;
        puVar36[0x3b] = 0;
        puVar36[0x33] = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
        puVar36[0x34] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
        puVar36[0x36] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
        puVar36[0x37] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
        puVar36[0x39] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
        puVar36[0x3a] = ((byte)puVar26 & 0xf) + 0x30;
        if (puVar26 == &DAT_00595999) {
          *(undefined2 *)(puVar36 + 0x39) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x36) = 0x2d2d;
          *(undefined2 *)(puVar36 + 0x33) = 0x2d2d;
        }
        local_3a4 = local_3a4 + 0xd;
        puVar36 = puVar36 + 0x46;
        local_3a0 = local_3a0 + 0xd;
        local_390 = local_390 + 5;
        iVar20 = *(int *)local_39c;
        local_39c = (byte *)((int)local_39c + 8);
        (&DAT_006c0bc6)[uVar23 * 8] = 0;
        bVar11 = ((char)(iVar20 / 100000) + (char)(iVar20 >> 0x1f)) -
                 (char)((longlong)iVar20 * 0x14f8b589 >> 0x3f);
        (&DAT_006c0bc0)[uVar23 * 8] = bVar11;
        (&DAT_006c0bc0)[uVar23 * 8] = (&DAT_006c0bc0)[uVar23 * 8] + '0';
        iVar20 = iVar20 + (uint)bVar11 * -100000;
        bVar11 = ((char)(iVar20 / 10000) + (char)(iVar20 >> 0x1f)) -
                 (char)((longlong)iVar20 * 0x68db8bad >> 0x3f);
        (&DAT_006c0bc1)[uVar23 * 8] = bVar11;
        (&DAT_006c0bc1)[uVar23 * 8] = (&DAT_006c0bc1)[uVar23 * 8] + '0';
        iVar20 = iVar20 + (uint)bVar11 * -10000;
        bVar11 = ((char)(iVar20 / 1000) + (char)(iVar20 >> 0x1f)) -
                 (char)((longlong)iVar20 * 0x10624dd3 >> 0x3f);
        (&DAT_006c0bc2)[uVar23 * 8] = bVar11;
        (&DAT_006c0bc2)[uVar23 * 8] = (&DAT_006c0bc2)[uVar23 * 8] + '0';
        iVar20 = iVar20 + (uint)bVar11 * -1000;
        bVar11 = ((char)(iVar20 / 100) + (char)(iVar20 >> 0x1f)) -
                 (char)((longlong)iVar20 * 0x51eb851f >> 0x3f);
        (&DAT_006c0bc3)[uVar23 * 8] = bVar11;
        (&DAT_006c0bc3)[uVar23 * 8] = (&DAT_006c0bc3)[uVar23 * 8] + '0';
        iVar20 = iVar20 + (uint)bVar11 * -100;
        cVar27 = (char)(iVar20 / 10);
        (&DAT_006c0bc4)[uVar23 * 8] = cVar27 + '0';
        puVar26 = PTR_DAT_00513210;
        (&DAT_006c0bc5)[uVar23 * 8] = (char)iVar20 + cVar27 * -10 + '0';
        uVar23 = uVar23 + 1;
        local_398 = local_398 + 10;
      } while (uVar23 < local_10);
    }
    puVar24 = PTR_DAT_00517e1c;
    PTR_DAT_00517e18[uVar23 * 5 + -3] = 0;
    PTR_s_0___1___2___3___4_00517e14[uVar23 * 4 + -3] = 0;
    *puVar24 = (char)(*(ushort *)(puVar26 + 0x110) / 10) + '0';
    puVar24[1] = (char)((ulonglong)*(ushort *)(puVar26 + 0x110) % 10) + '0';
    puVar5 = PTR_DAT_00517e20;
    puVar24[5] = (char)(*(ushort *)(puVar26 + 0x112) / 10) + '0';
    puVar24[6] = (char)((ulonglong)*(ushort *)(puVar26 + 0x112) % 10) + '0';
    *puVar5 = ((byte)(*(int *)(puVar26 + 0x268) >> 0x14) & 0xf) + 0x30;
    puVar5[1] = (puVar26[0x26a] & 0xf) + 0x30;
    puVar5[3] = ((byte)(*(int *)(puVar26 + 0x268) >> 0xc) & 0xf) + 0x30;
    puVar5[4] = ((byte)((uint)*(undefined4 *)(puVar26 + 0x268) >> 8) & 0xf) + 0x30;
    puVar5[6] = ((byte)(*(int *)(puVar26 + 0x268) >> 4) & 0xf) + 0x30;
    puVar5[7] = (puVar26[0x268] & 0xf) + 0x30;
    puVar24 = PTR_DAT_00517e24;
    *PTR_DAT_00517e24 = ((byte)(*(int *)(puVar26 + 600) >> 0x14) & 0xf) + 0x30;
    puVar24[1] = (puVar26[0x25a] & 0xf) + 0x30;
    puVar24[3] = ((byte)(*(int *)(puVar26 + 600) >> 0xc) & 0xf) + 0x30;
    puVar24[4] = ((byte)((uint)*(undefined4 *)(puVar26 + 600) >> 8) & 0xf) + 0x30;
    puVar5 = PTR_DAT_00517e2c;
    puVar24[6] = ((byte)(*(int *)(puVar26 + 600) >> 4) & 0xf) + 0x30;
    puVar24[7] = (puVar26[600] & 0xf) + 0x30;
    *puVar5 = ((byte)(*(int *)(puVar26 + 0x25c) >> 0x14) & 0xf) + 0x30;
    puVar5[1] = (puVar26[0x25e] & 0xf) + 0x30;
    puVar5[3] = ((byte)(*(int *)(puVar26 + 0x25c) >> 0xc) & 0xf) + 0x30;
    puVar5[4] = ((byte)((uint)*(undefined4 *)(puVar26 + 0x25c) >> 8) & 0xf) + 0x30;
    puVar5[6] = ((byte)(*(int *)(puVar26 + 0x25c) >> 4) & 0xf) + 0x30;
    puVar5[7] = (puVar26[0x25c] & 0xf) + 0x30;
    *PTR_DAT_00517e30 = puVar26[6] + '0';
    puVar24 = PTR_DAT_00517e28;
    *PTR_DAT_00517e28 = (byte)puVar26[0x40d] / 0x14 + 0x30;
    uVar23 = _DAT_006c0b60 & 0xff;
    puVar24[1] = ((byte)puVar26[0x40d] >> 1) % 10 + 0x30;
    DAT_006c1100 = FUN_0045cb60(uVar23,&DAT_0051703c,4,0,s_OVERALL_TALLY_00517bc8);
    DAT_006c1104 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e18);
    DAT_006c1108 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_TORN_TALLY_00517bd8);
    DAT_006c110c = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,
                                PTR_s_0___1___2___3___4_00517e14);
    DAT_006c1110 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_TORN_PLAYER_00517be4);
    DAT_006c1114 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_TORN_WINNER_00517bf0);
    uVar23 = 0;
    if (DAT_006c1069 != 0) {
      puVar36 = &DAT_006c0bc0;
      do {
        uVar18 = FUN_0045cb60(local_394,&DAT_0051703c,4,0,s_SCORE_00517bfc);
        (&DAT_006c1118)[uVar23] = uVar18;
        uVar18 = FUN_0045cbc0(local_388,&DAT_00517030,4,0,puVar36);
        (&DAT_006c112c)[uVar23] = uVar18;
        uVar23 = uVar23 + 1;
        puVar36 = puVar36 + 8;
      } while (uVar23 < DAT_006c1069);
    }
    DAT_006c1148 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_RACE_TIME_00517c04);
    DAT_006c114c = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,&DAT_006c0b80);
    DAT_006c1150 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_RACE_TIME_00517c10);
    DAT_006c1154 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,&DAT_006c0b8a);
    DAT_006c1158 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_AGGREGATE_TIME_00517c1c);
    DAT_006c115c = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e20);
    local_39c = (byte *)0x0;
    if (DAT_006c1069 != 0) {
      puVar36 = &DAT_006c0c00;
      puVar13 = &DAT_006c1174;
      do {
        uVar18 = FUN_0045cb60(local_394,&DAT_0051703c,4,0,s_FIVE_BEST_LAPS_00517c2c);
        iVar20 = 5;
        (&DAT_006c1160)[(int)local_39c] = uVar18;
        do {
          uVar18 = FUN_0045cbc0(local_394,&DAT_00517030,4,0,puVar36);
          *puVar13 = uVar18;
          puVar36 = puVar36 + 0xe;
          puVar13 = puVar13 + 1;
          iVar20 = iVar20 + -1;
        } while (iVar20 != 0);
        local_39c = (byte *)((int)local_39c + 1);
      } while (local_39c < (uint)DAT_006c1069);
    }
    DAT_006c11d8 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_WINNER_00517c3c);
    DAT_006c11dc = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_0051703c,4,0,s_LOSER_00517c44);
    uVar23 = _DAT_006c0b54;
    if (PTR_DAT_00513210[0x2a4] == '\x02') {
      uVar23 = _DAT_006c0b60;
    }
    DAT_006c11e0 = FUN_0045cb60(uVar23 & 0xff,&DAT_00517038,4,0,&DAT_00517c4c);
    uVar23 = _DAT_006c0b54;
    if (PTR_DAT_00513210[0x2a4] == '\x02') {
      uVar23 = _DAT_006c0b60;
    }
    DAT_006c11e4 = FUN_0045cb60(uVar23 & 0xff,&DAT_00517038,4,0,&DAT_00517c54);
    DAT_006c11e8 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_SCORE_00517c5c);
    DAT_006c11ec = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e1c);
    DAT_006c11f0 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_RECORD_TIME_00517c64);
    DAT_006c11f4 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e24);
    DAT_006c11f8 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_QUALIFY_TIME_00517c70);
    DAT_006c11fc = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e2c);
    DAT_006c1200 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_FAIL_TEXT_00517c80);
    DAT_006c1204 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_QUALIFY_TEXT_00517c8c);
    DAT_006c1208 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_YOUR_POSITION_00517c9c);
    DAT_006c120c = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e30);
    DAT_006c1210 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,0,0,s_RACE_POS_00517cac);
    DAT_006c1214 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_FAIL_LEAGUE_00517cb8);
    DAT_006c1218 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,s_QUALIFY_LEAGUE_00517cc4);
    DAT_006c121c = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0051703c,4,0,s_CONTINUES_LEFT_00517cd4);
    DAT_006c1220 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,PTR_DAT_00517e28);
    if ((((PTR_DAT_00513210[0x280] != '\b') && (PTR_DAT_00513210[0x280] != '\t')) &&
        ((PTR_DAT_00513214[0x1e] == '\x01' || (2 < DAT_006c1069)))) &&
       (uVar23 = 0, DAT_006c1069 != 0)) {
      iVar20 = 0;
      local_10 = 0xffae815d;
      do {
        puVar26 = PTR_DAT_00513210;
        if (((byte)PTR_DAT_00513210[uVar23 + 0x30] < 0x45) ||
           (0x80 < (byte)PTR_DAT_00513210[uVar23 + 0x30])) {
          PTR_DAT_00513210[uVar23 + 0x30] = 0x45;
        }
        cVar27 = puVar26[uVar23 + 0x30];
        if ((&DAT_00517ea4)[uVar23] != cVar27) {
          puVar26[uVar23 + 0x30] = cVar27;
          (&DAT_00517ea4)[uVar23] = cVar27;
          FUN_00430440();
          PTR_DAT_00513210[uVar23 + 0x30] = cVar27;
          FUN_00454090();
          FUN_00478d80(extraout_ECX_06);
        }
        uVar18 = FUN_0045cbc0(local_388,&DAT_00517044,4,0,PTR_DAT_00513214 + iVar20 + 0x80);
        (&DAT_006c1224)[uVar23] = uVar18;
        FUN_004212a0((int)&uStack_20 + 4,&DAT_00517ce4,PTR_DAT_00513210[uVar23 + 6]);
        uVar18 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,(int)&uStack_20 + 4);
        (&DAT_006c1238)[uVar23] = uVar18;
        FUN_004212a0((int)&uStack_20 + 4,&DAT_00517ce8,PTR_DAT_00513210[uVar23 + 0x274]);
        uVar18 = FUN_0045cbc0(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,(int)&uStack_20 + 4);
        (&DAT_006c124c)[uVar23] = uVar18;
        uVar23 = uVar23 + 1;
        iVar20 = iVar20 + 0xb;
      } while (uVar23 < DAT_006c1069);
    }
    if (PTR_DAT_00513214[0x1e] == '\x01') {
      if ((PTR_DAT_00513214[0x12] == '\0') || (2 < (byte)PTR_DAT_00513214[0x1c])) {
        *(undefined2 *)(PTR_PTR_00515a38 + 0x50) = 0x41e;
      }
      else {
        *(undefined2 *)(PTR_PTR_00515a38 + 0x50) = 0x42d;
      }
    }
    break;
  case 0x2f:
  case 0x30:
    local_10 = 0x103060a;
    local_c = 0;
    DAT_006c1084 = 0;
    DAT_006c1078 = 0;
    _DAT_006c0de0 = 0;
    DAT_006c0de4 = '\0';
    _DAT_00515afc = 0;
    _DAT_00515af0 = 0;
    if (DAT_006c0dce == '\0') {
      *(uint *)(PTR_DAT_00513210 + 0xc) =
           *(int *)(PTR_DAT_00513210 + 0xc) + (uint)(byte)local_14[(byte)PTR_DAT_00513210[6] + 3];
    }
    local_398 = *(undefined1 **)(puVar26 + 0xc);
    DAT_0060e400 = 0;
    DAT_0060e3fc = (uint)(byte)local_14[(byte)puVar26[6] + 3];
    DAT_0060e3f8 = (uint)local_398;
    if (DAT_006c0dce == '\0') {
      *(uint *)(puVar26 + 0x10) =
           *(int *)(puVar26 + 0x10) + (uint)(byte)local_14[(byte)puVar26[7] + 3];
    }
    uVar23 = *(uint *)(puVar26 + 0x10);
    DAT_0060e40c = 1;
    DAT_0060e408 = (uint)(byte)local_14[(byte)puVar26[7] + 3];
    _DAT_0060e404 = uVar23;
    if (DAT_006c0dce == '\0') {
      *(uint *)(puVar26 + 0x14) =
           *(int *)(puVar26 + 0x14) + (uint)(byte)local_14[(byte)puVar26[8] + 3];
    }
    pcVar43 = *(char **)(puVar26 + 0x14);
    DAT_0060e418 = 2;
    DAT_0060e414 = (uint)(byte)local_14[(byte)puVar26[8] + 3];
    _DAT_0060e410 = (uint)pcVar43;
    if (DAT_006c0dce == '\0') {
      *(uint *)(puVar26 + 0x18) =
           *(int *)(puVar26 + 0x18) + (uint)(byte)local_14[(byte)puVar26[9] + 3];
    }
    local_390 = *(char **)(puVar26 + 0x18);
    DAT_0060e424 = 3;
    DAT_0060e420 = (uint)(byte)local_14[(byte)puVar26[9] + 3];
    _DAT_0060e41c = (uint)local_390;
    if (DAT_006c0dce == '\0') {
      *(uint *)(puVar26 + 0x1c) =
           *(int *)(puVar26 + 0x1c) + (uint)(byte)local_14[(byte)puVar26[10] + 3];
    }
    local_388 = *(uint *)(puVar26 + 0x1c);
    DAT_0060e430 = 4;
    DAT_0060e42c = (uint)(byte)local_14[(byte)puVar26[10] + 3];
    _DAT_0060e428 = (char *)local_388;
    if (((DAT_006c0dce == '\0') && (puVar26[6] == '\x01')) &&
       (uVar28 = CONCAT11(puVar26[0x40d],puVar26[0x40d]) & 0xfffffffe, (byte)uVar28 < 0x1c)) {
      uVar21 = (undefined1)(uVar28 >> 8);
      uVar28 = (CONCAT11(uVar21,uVar21) & 0x1ff) & 0xfffffffe;
      puVar26[0x40d] = (char)uVar28 + 2U | (byte)(uVar28 >> 8);
    }
    DAT_006c0dce = '\x01';
    if (in_CL == 0x30) {
      _DAT_00515b04 = 0x100;
      local_39c = (byte *)0x5;
      uVar28 = 1;
      do {
        uVar37 = DAT_0060e400;
        uVar19 = DAT_0060e3fc;
        puVar36 = (undefined1 *)uVar23;
        if (local_398 < uVar23) {
          DAT_0060e3fc = DAT_0060e408;
          DAT_0060e400 = DAT_0060e40c;
          _DAT_0060e404 = (uint)local_398;
          DAT_0060e408 = uVar19;
          DAT_0060e40c = uVar37;
          uVar28 = uVar37;
          puVar36 = local_398;
          DAT_0060e3f8 = uVar23;
          local_398 = (undefined1 *)uVar23;
        }
        uVar19 = DAT_0060e408;
        uVar23 = (uint)puVar36;
        uVar37 = (uint)pcVar43;
        if (puVar36 < pcVar43) {
          DAT_0060e408 = DAT_0060e414;
          DAT_0060e40c = DAT_0060e418;
          uVar23 = (uint)pcVar43;
          uVar37 = (uint)puVar36;
          _DAT_0060e404 = (uint)pcVar43;
          _DAT_0060e410 = (uint)puVar36;
          DAT_0060e414 = uVar19;
          DAT_0060e418 = uVar28;
        }
        uVar19 = DAT_0060e418;
        uVar28 = DAT_0060e414;
        pcVar43 = (char *)uVar37;
        if (uVar37 < local_390) {
          DAT_0060e414 = DAT_0060e420;
          DAT_0060e418 = DAT_0060e424;
          _DAT_0060e410 = (uint)local_390;
          pcVar43 = local_390;
          _DAT_0060e41c = uVar37;
          DAT_0060e420 = uVar28;
          DAT_0060e424 = uVar19;
          local_390 = (char *)uVar37;
          local_10 = uVar19;
        }
        pcVar33 = local_390;
        uVar19 = DAT_0060e424;
        uVar28 = DAT_0060e420;
        if (local_390 < local_388) {
          local_390 = (char *)local_388;
          _DAT_0060e41c = local_388;
          DAT_0060e420 = DAT_0060e42c;
          DAT_0060e424 = DAT_0060e430;
          _DAT_0060e428 = pcVar33;
          DAT_0060e42c = uVar28;
          DAT_0060e430 = uVar19;
          local_388 = (uint)pcVar33;
          local_10 = uVar19;
        }
        local_39c = (byte *)((int)local_39c + -1);
        uVar28 = DAT_0060e40c;
      } while (local_39c != (byte *)0x0);
      DAT_0060e3a0 = (char)DAT_0060e400;
      if (DAT_0060e3a0 == '\0') {
        DAT_006c1080 = 4;
        DAT_006c1078 = 0;
      }
      DAT_0060e3a1 = (char)DAT_0060e40c;
      if (DAT_0060e3a1 == '\0') {
        DAT_006c1080 = 3;
        DAT_006c1078 = 1;
      }
      uVar23 = (uint)(DAT_0060e3a1 == '\0');
      DAT_0060e3a2 = (char)DAT_0060e418;
      if (DAT_0060e3a2 == '\0') {
        uVar23 = 2;
        DAT_006c1080 = 2;
        DAT_006c1078 = 2;
      }
      DAT_0060e3a3 = (char)DAT_0060e424;
      if (DAT_0060e3a3 == '\0') {
        uVar23 = 3;
        DAT_006c1080 = 1;
        DAT_006c1078 = 3;
      }
      DAT_0060e3a4 = (char)DAT_0060e430;
      if (DAT_0060e3a4 == '\0') {
        uVar23 = 4;
        DAT_006c1080 = 0;
        DAT_006c1078 = 4;
      }
      DAT_00515aff = in_CL;
      *(undefined2 *)(PTR_PTR_00515a40 + 0x50) = 0x30a;
    }
    else {
      DAT_00515aff = 0x2f;
      _DAT_00515b04 = 0x100;
      *(undefined2 *)((&PTR_PTR_00515980)[uVar14] + 0x50) = 0x330;
      DAT_006c1080 = 5 - (uint)(byte)puVar26[6];
      uVar23 = (byte)puVar26[6] - 1;
      DAT_006c1078 = uVar23;
    }
    if (uVar23 == 0) {
      DAT_006c115c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_QUALIFY_KNOCKOUT_00517cfc
                                 );
    }
    else {
      DAT_006c115c = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_0051703c,4,0,s_FAIL_KNOCKOUT_00517cec);
    }
    DAT_006c0dd0 = uVar23 == 0;
    DAT_006c1160 = FUN_0045cb60(_DAT_006c0b60 & 0xff,&DAT_0060e3a8,0,0,s_CONTINUE_AWARD_00517d10);
    _DAT_006c1070 = DAT_006c1080 * 0x80;
    DAT_0051237e = 1;
    DAT_006c1050 = 0;
    DAT_006c1088 = _DAT_006c1070 + 100;
    _DAT_006c106c = _DAT_006c1070 + 0xe4;
    DAT_006c107c = _DAT_006c1070 + 0x22;
    _DAT_006c1070 = _DAT_006c1070 + 0x3a;
    DAT_006c1074 = _DAT_006c1070;
    _DAT_006c108c = DAT_006c107c;
    DAT_006c1090 = _DAT_006c106c;
    _DAT_006c1094 = DAT_006c1088;
    FUN_0047a3b0();
    FUN_0045fa90();
    puVar26 = (&PTR_PTR_00515980)[uVar14];
    _DAT_006c0d60 = 0xff;
    DAT_006c0dd4 = 0xff;
    DAT_006c0dec = 0xff;
    *(undefined2 *)(puVar26 + 0x14) = 0;
    *(undefined4 *)(puVar26 + 8) = 0;
    puVar26 = PTR_PTR_00515a3c;
    DAT_0060e377 = 0;
    DAT_0060e376 = 0;
    DAT_006c1044 = 0xff;
    if (in_CL == 0x2f) {
      _DAT_006c1300 = 0;
      PTR_PTR_00515a3c[0x17] = 0x2f;
      *(undefined2 *)(puVar26 + 0x1c) = 0x100;
      if (PTR_DAT_00513210[0x280] == '\x0f') {
        DAT_006c1150 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_0051703c,4,0,
                                    s_POINTS_POSITION_00517d20);
        DAT_006c1154 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_RACE_POINTS_00517d30);
        DAT_006c1158 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_COMBAT_POINTS_00517d3c)
        ;
        DAT_006c1164 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_TOTAL_POINTS_00517d4c);
        DAT_006c1168 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_LAP_BONUS_00517d5c);
        local_390 = (char *)0x0;
        local_388 = 0;
        do {
          uVar18 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_RACE_VALUES_00517d68);
          *(undefined4 *)((int)&DAT_006c1100 + local_388) = uVar18;
          uVar18 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_RACE_POS_00517d74);
          puVar26 = PTR_DAT_00513210;
          iVar20 = 0;
          *(undefined4 *)((int)&DAT_006c1114 + local_388) = uVar18;
          if (puVar26[(int)local_390 + 0xe1] != '\0') {
            iVar20 = 5000;
          }
          uVar23 = iVar20 + (uint)*(ushort *)(puVar26 + (int)local_390 + 0xe2) +
                   *(int *)(puVar26 + (int)local_390 + 0xe4);
          pbVar38 = *(byte **)((int)&PTR_DAT_004f2984 + local_388);
          pbVar2 = *(byte **)((int)&PTR_DAT_004f2970 + local_388);
          bVar11 = (byte)((uint)((ulonglong)uVar23 * 0x14f8b588f >> 0x21) >> 0x10);
          *pbVar38 = bVar11;
          uVar23 = uVar23 + (uint)bVar11 * -100000;
          uVar28 = uVar23 / 10000;
          pbVar38[1] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -10000;
          uVar28 = uVar23 / 1000;
          pbVar38[2] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -1000;
          uVar28 = uVar23 / 100;
          pbVar38[3] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -100;
          bVar11 = (byte)(uVar23 / 10);
          pbVar38[4] = bVar11;
          pbVar38[5] = (char)uVar23 + bVar11 * -10;
          uVar23 = *(uint *)(puVar26 + (int)local_390 + 0xe4);
          bVar11 = (byte)((uint)((ulonglong)uVar23 * 0x14f8b588f >> 0x21) >> 0x10);
          *pbVar2 = bVar11;
          uVar23 = uVar23 + (uint)bVar11 * -100000;
          uVar28 = uVar23 / 10000;
          pbVar2[1] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -10000;
          uVar28 = uVar23 / 1000;
          pbVar2[2] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -1000;
          uVar28 = uVar23 / 100;
          pbVar2[3] = (byte)uVar28;
          uVar23 = uVar23 + (uVar28 & 0xff) * -100;
          bVar11 = (byte)(uVar23 / 10);
          pbVar2[4] = bVar11;
          pbVar2[5] = (char)uVar23 + bVar11 * -10;
          uVar31 = *(ushort *)(puVar26 + (int)local_390 + 0xe2);
          pcVar43 = *(char **)((int)&PTR_s_aaaaaa_004f2840 + local_388);
          *pcVar43 = '\0';
          pcVar43[1] = (char)(uVar31 / 10000);
          uVar23 = (uint)uVar31 % 10000;
          pcVar43[2] = (char)(uVar23 / 1000);
          uVar23 = uVar23 % 1000;
          pcVar43[3] = (char)(uVar23 / 100);
          uVar23 = uVar23 % 100;
          cVar27 = (char)(uVar23 / 10);
          pcVar43[4] = cVar27;
          pcVar43[5] = (char)uVar23 + cVar27 * -10;
          *pbVar38 = *pbVar38 + 0x30;
          *pbVar2 = *pbVar2 + 0x30;
          *pcVar43 = *pcVar43 + '0';
          pbVar38[1] = pbVar38[1] + 0x30;
          pbVar2[1] = pbVar2[1] + 0x30;
          pcVar43[1] = pcVar43[1] + '0';
          pbVar38[2] = pbVar38[2] + 0x30;
          pbVar2[2] = pbVar2[2] + 0x30;
          pcVar43[2] = pcVar43[2] + '0';
          pbVar38[3] = pbVar38[3] + 0x30;
          pbVar2[3] = pbVar2[3] + 0x30;
          pcVar43[3] = pcVar43[3] + '0';
          pbVar38[4] = pbVar38[4] + 0x30;
          pbVar2[4] = pbVar2[4] + 0x30;
          pcVar43[4] = pcVar43[4] + '0';
          pbVar38[5] = pbVar38[5] + 0x30;
          uVar23 = _DAT_006c0b60 & 0xff;
          pbVar2[5] = pbVar2[5] + 0x30;
          pcVar43[5] = pcVar43[5] + '0';
          uVar18 = FUN_0045cbc0(uVar23,&DAT_00517030,4,0,pcVar43);
          *(undefined4 *)((int)&DAT_006c1128 + local_388) = uVar18;
          uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,
                                *(undefined4 *)((int)&PTR_DAT_004f2970 + local_388));
          *(undefined4 *)((int)&DAT_006c113c + local_388) = uVar18;
          uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,
                                *(undefined4 *)((int)&PTR_DAT_004f2984 + local_388));
          *(undefined4 *)((int)&DAT_006c116c + local_388) = uVar18;
          puVar26 = &DAT_00517d80;
          if (PTR_DAT_00513210[(int)local_390 + 0xe1] == '\0') {
            puVar26 = &DAT_00517d88;
          }
          uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,puVar26);
          local_390 = (char *)((int)local_390 + 8);
          *(undefined4 *)((int)&DAT_006c1180 + local_388) = uVar18;
          local_388 = local_388 + 4;
        } while (local_390 < 0x28);
      }
      else {
        DAT_006c1150 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_0051703c,4,0,s_RACE_POSITION_00517d90)
        ;
        DAT_006c1154 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_RACE_TIME2_00517da0);
        DAT_006c1158 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_BEST_LAP_00517dac);
        iVar20 = 0;
        local_398 = (undefined1 *)0x5;
        puVar13 = &DAT_006c1114;
        puVar36 = &DAT_006c0c05;
        do {
          uVar18 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_RACE_VALUES_00517db8);
          puVar13[-5] = uVar18;
          uVar18 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_RACE_POS_00517dc4);
          *puVar13 = uVar18;
          pcVar43 = puVar36 + -5;
          puVar26 = *(undefined **)(PTR_DAT_00513210 + iVar20 + 0x128);
          puVar36[-3] = 0x3a;
          *puVar36 = 0x3a;
          *pcVar43 = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
          puVar36[3] = 0;
          puVar36[-4] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
          puVar36[-2] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
          puVar36[-1] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
          puVar36[1] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
          puVar36[2] = ((byte)puVar26 & 0xf) + 0x30;
          if (puVar26 == &DAT_00595999) {
            *(undefined2 *)(puVar36 + 1) = 0x2d2d;
            *(undefined2 *)(puVar36 + -2) = 0x2d2d;
            puVar36[-4] = 0x2d;
            *pcVar43 = '-';
          }
          uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,pcVar43);
          puVar13[5] = uVar18;
          pcVar43 = puVar36 + 0x41;
          puVar26 = *(undefined **)(PTR_DAT_00513210 + iVar20 + 0x124);
          puVar36[0x43] = 0x3a;
          puVar36[0x46] = 0x3a;
          *pcVar43 = ((byte)((uint)puVar26 >> 0x14) & 0xf) + 0x30;
          puVar36[0x49] = 0;
          puVar36[0x42] = ((byte)((uint)puVar26 >> 0x10) & 0xf) + 0x30;
          puVar36[0x44] = ((byte)((uint)puVar26 >> 0xc) & 0xf) + 0x30;
          puVar36[0x45] = ((byte)((uint)puVar26 >> 8) & 0xf) + 0x30;
          puVar36[0x47] = ((byte)((uint)puVar26 >> 4) & 0xf) + 0x30;
          puVar36[0x48] = ((byte)puVar26 & 0xf) + 0x30;
          if (puVar26 == &DAT_00595999) {
            *(undefined2 *)(puVar36 + 0x47) = 0x2d2d;
            *(undefined2 *)(puVar36 + 0x44) = 0x2d2d;
            puVar36[0x42] = 0x2d;
            *pcVar43 = '-';
          }
          uVar18 = FUN_0045cbc0(_DAT_006c0b60 & 0xff,&DAT_00517030,4,0,pcVar43);
          puVar13[10] = uVar18;
          iVar20 = iVar20 + 0x34;
          puVar36 = puVar36 + 0xe;
          puVar13 = puVar13 + 1;
          local_398 = (undefined1 *)((int)local_398 + -1);
        } while (local_398 != (undefined1 *)0x0);
      }
    }
    else {
      DAT_006c1150 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_0051703c,4,0,s_RACE_POSITION_00517dd0);
      DAT_006c1154 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_RACE_POINTS_00517de0);
      DAT_006c1158 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517038,4,0,s_LEAGUE_POINTS_00517dec);
      iVar20 = 0;
      uVar23 = 0;
      do {
        uVar18 = FUN_0045cb60(_DAT_006c0b54 & 0xff,&DAT_00517030,4,0,s_RACE_VALUES_00517dfc);
        *(undefined4 *)((int)&DAT_006c1100 + iVar20) = uVar18;
        uVar18 = FUN_0045cb60(_DAT_006c0b58 & 0xff,&DAT_00517030,4,0,s_RACE_POS_00517e08);
        *(undefined4 *)((int)&DAT_006c1114 + iVar20) = uVar18;
        uVar28 = *(uint *)((int)&DAT_0060e3fc + uVar23);
        pcVar43 = *(char **)((int)&PTR_DAT_004f279c + iVar20);
        *pcVar43 = (char)((ulonglong)uVar28 / 10) + '0';
        uVar19 = _DAT_006c0b60 & 0xff;
        pcVar43[1] = (char)((ulonglong)uVar28 % 10) + '0';
        uVar18 = FUN_0045cbc0(uVar19,&DAT_00517030,4,0,pcVar43);
        *(undefined4 *)((int)&DAT_006c1128 + iVar20) = uVar18;
        uVar28 = *(uint *)((int)&DAT_0060e3f8 + uVar23);
        pcVar43 = *(char **)((int)&PTR_DAT_004f29b0 + iVar20);
        *pcVar43 = (char)((ulonglong)uVar28 / 10) + '0';
        uVar19 = _DAT_006c0b60 & 0xff;
        pcVar43[1] = (char)((ulonglong)uVar28 % 10) + '0';
        uVar18 = FUN_0045cbc0(uVar19,&DAT_00517030,4,0,pcVar43);
        uVar23 = uVar23 + 0xc;
        *(undefined4 *)((int)&DAT_006c113c + iVar20) = uVar18;
        iVar20 = iVar20 + 4;
      } while (uVar23 < 0x3c);
    }
    local_398 = (undefined1 *)0x0;
    local_394 = &DAT_006c0e10;
    local_388 = 8;
    fVar40 = (float)(DAT_00696ae8 * 0x48 >> 8);
    fVar41 = (float)(DAT_00696aec * 0x16 >> 8);
    do {
      pbVar38 = (byte *)((((uint)local_398 & 1) + (uint)*(ushort *)(DAT_006c0b50 + 0x2e)) * 0x10 +
                        DAT_00791590);
      uVar18 = *(undefined4 *)(pbVar38 + 4);
      uVar3 = *(undefined4 *)pbVar38;
      *(undefined1 *)((int)local_394 + -9) = 0xbc;
      uVar31 = (ushort)((uint)uVar18 >> 0x10) & 0x3f | 0x80;
      *local_394 = 0x40400000;
      uVar29 = (undefined1)uVar3;
      *(undefined1 *)(local_394 + 1) = uVar29;
      *(ushort *)((int)local_394 + 6) = uVar31;
      uVar21 = (undefined1)((uint)uVar3 >> 8);
      *(undefined1 *)((int)local_394 + 5) = uVar21;
      *(ushort *)(local_394 + 4) = (ushort)pbVar38[4] - (ushort)*pbVar38;
      *(ushort *)((int)local_394 + 0x12) = (ushort)pbVar38[9] - (ushort)pbVar38[1];
      local_394[-3] = 0xbefefefe;
      local_394[2] = fVar40;
      local_394[3] = fVar41;
      *(undefined1 *)((int)local_394 + 0x117) = 0xbc;
      *(ushort *)((int)local_394 + 0x126) = uVar31;
      local_394[0x48] = 0x40400000;
      *(undefined1 *)(local_394 + 0x49) = uVar29;
      *(undefined1 *)((int)local_394 + 0x125) = uVar21;
      *(ushort *)(local_394 + 0x4c) = (ushort)pbVar38[4] - (ushort)*pbVar38;
      *(ushort *)((int)local_394 + 0x132) = (ushort)pbVar38[9] - (ushort)pbVar38[1];
      *(undefined2 *)(local_394 + 0x45) = 0xfefe;
      local_398 = (undefined1 *)((int)local_398 + 1);
      *(undefined1 *)((int)local_394 + 0x116) = 0xfe;
      local_394[0x4a] = fVar40;
      local_394[0x4b] = fVar41;
      *(byte *)((int)local_394 + 0x117) = *(byte *)((int)local_394 + 0x117) | 2;
      local_394 = local_394 + 9;
      local_388 = local_388 + -1;
    } while (local_388 != 0);
    break;
  case 0x31:
    iVar20 = FUN_0047d0c0();
    if (iVar20 == 0) {
      FUN_0047d2f0();
    }
  }
  if ((in_CL < 0x2e) && (puVar26 = (&PTR_PTR_00515980)[uVar14], puVar26 != (undefined *)0x0)) {
    if (('\x1f' < (char)puVar26[0x14]) || (puVar26[(char)puVar26[0x14] + 0x2f] == '\x01')) {
      puVar26[0x14] = 0;
      do {
        if (puVar26[(char)puVar26[0x14] + 0x2f] != '\x01') break;
        cVar27 = puVar26[0x14] + '\x01';
        puVar26[0x14] = cVar27;
        puVar26[0x15] = cVar27;
      } while ((char)puVar26[0x14] < '\x1f');
    }
    if ('\x1f' < (char)puVar26[0x14]) {
      *(undefined2 *)(puVar26 + 0x14) = 0;
    }
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

