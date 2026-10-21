
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0042c160(void)

{
  uint uVar1;
  undefined8 uVar2;
  undefined8 uVar3;
  undefined8 uVar4;
  undefined8 uVar5;
  ushort uVar6;
  short sVar7;
  short sVar8;
  uint uVar9;
  uint uVar10;
  uint uVar11;
  uint uVar12;
  float fVar13;
  uint uVar14;
  uint uVar15;
  uint uVar16;
  float fVar17;
  uint uVar18;
  uint uVar19;
  float fVar20;
  uint uVar21;
  uint uVar22;
  int iVar23;
  int iVar24;
  uint uVar25;
  uint uVar26;
  int extraout_ECX;
  int iVar27;
  int iVar28;
  int iVar29;
  uint *puVar30;
  int iVar31;
  float fVar32;
  int local_640;
  undefined4 local_63c;
  undefined4 local_634;
  int local_628;
  uint local_61c;
  undefined4 local_618;
  undefined4 local_614;
  undefined4 *local_610;
  undefined4 local_60c;
  uint local_608;
  float fStack_604;
  uint auStack_600 [2];
  undefined8 uStack_5f8;
  uint local_5f0;
  float fStack_5ec;
  uint auStack_5e8 [2];
  undefined8 auStack_5e0 [187];
  uint local_8;
  
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  local_628 = 0;
  do {
    iVar31 = DAT_007990e4;
    local_610 = *(undefined4 **)(local_628 + 0xc + DAT_007990e4);
    if (local_610 != (undefined4 *)0x0) {
      iVar24 = FUN_0048ece0();
      iVar27 = extraout_ECX;
      if (iVar24 == 1) {
        iVar27 = extraout_ECX + -1;
        local_610 = (undefined4 *)iVar27;
      }
      *(int *)(local_628 + 0xc + iVar31) = iVar27;
      if (0 < iVar27) {
        iVar28 = *(int *)(local_628 + 0x24 + iVar31) - (int)local_610;
        uVar6 = *(ushort *)(local_628 + 6 + iVar31);
        local_640 = (uint)uVar6 << 0x10;
        iVar27 = *(int *)(local_628 + iVar31);
        iVar29 = (iVar28 + 5) * *(int *)(local_628 + 0x28 + iVar31);
        iVar24 = *(int *)(local_628 + 8 + iVar31);
        local_618 = 0x20;
        iVar28 = (iVar28 + 2) * *(int *)(local_628 + 0x28 + iVar31);
        local_60c = &local_608;
        local_614 = &DAT_00513260;
        do {
          sVar7 = local_614[0x40];
          sVar8 = *local_614;
          DAT_00696224 = (undefined2)((uint)(sVar7 * 4 * iVar28 + iVar27) >> 0x10);
          local_634 = CONCAT22(local_634._2_2_,(short)((uint)(sVar8 * 4 * iVar28 + iVar24) >> 0x10))
          ;
          _DAT_00696228 = local_634;
          DAT_00696226 = uVar6;
          (*DAT_0069633c)(local_60c);
          local_640 = CONCAT22(local_640._2_2_,(short)((uint)(sVar7 * 4 * iVar29 + iVar27) >> 0x10))
          ;
          local_63c = CONCAT22(local_63c._2_2_,(short)((uint)(sVar8 * 4 * iVar29 + iVar24) >> 0x10))
          ;
          (*DAT_00696344)();
          _DAT_00696224 = local_640;
          _DAT_00696228 = local_63c;
          (*DAT_0069633c)(local_60c + 6);
          local_614 = local_614 + 8;
          local_60c = local_60c + 0xc;
          (*DAT_00696344)();
          iVar23 = DAT_00791594;
          local_618 = local_618 + -1;
        } while (local_618 != 0);
        local_610 = (undefined4 *)(iVar31 + 0x2c + local_628);
        uVar25 = *(int *)(local_628 + 0x10 + iVar31) + 1;
        uVar25 = -(uint)(uVar25 < *(uint *)(local_628 + 0x1c + iVar31)) & uVar25;
        *(uint *)(local_628 + 0x10 + iVar31) = uVar25;
        iVar31 = *(int *)(local_628 + 0x18 + iVar31);
        puVar30 = (uint *)((*(ushort *)(iVar23 + 0x2e) + uVar25 + iVar31) * 0x10 + DAT_00791590);
        if (iVar31 == 0x8b) {
          local_618._2_2_ = (undefined2)(*puVar30 >> 0x10);
          local_618._0_2_ = CONCAT11(*(undefined1 *)((int)puVar30 + 9),(char)*puVar30);
          local_614._2_2_ = (undefined2)(puVar30[1] >> 0x10);
          local_614._0_2_ = CONCAT11(*(undefined1 *)((int)puVar30 + 0xb),(char)puVar30[1]);
          local_60c._2_2_ = (undefined2)(puVar30[2] >> 0x10);
          local_60c._0_2_ = CONCAT11(*(undefined1 *)((int)puVar30 + 1),(char)puVar30[2]);
          local_60c = (uint *)CONCAT13(*(undefined1 *)((int)puVar30 + 5),(undefined3)local_60c);
          local_61c = local_618;
        }
        else {
          local_61c = *puVar30;
          local_60c = (uint *)puVar30[2];
          local_614 = (short *)puVar30[1];
        }
        puVar30 = local_610 + 9;
        uVar25 = 0;
        do {
          uVar1 = uVar25 + 1;
          uVar26 = -(uint)(uVar1 < 0x20) & uVar1;
          fVar32 = (&fStack_5ec)[uVar25 * 0xc] + (&fStack_604)[uVar25 * 0xc] +
                   (&fStack_604)[uVar26 * 0xc] + (&fStack_5ec)[uVar26 * 0xc];
          if ((0.0 < fVar32) &&
             (((iVar31 = ((int)fVar32 >> 7) + -1, iVar31 < 0x101 ||
               (iVar31 = iVar31 / 2 + 0x80, iVar31 < 0x181)) ||
              (iVar31 = iVar31 / 2 + 0xc0, iVar31 < 0x200)))) {
            if (iVar31 < 1) {
              iVar31 = 1;
            }
            else if (0x1fb < iVar31) goto LAB_0042c5c1;
            uVar9 = (&local_5f0)[uVar25 * 0xc];
            fVar32 = (&fStack_5ec)[uVar25 * 0xc];
            uVar10 = auStack_5e8[uVar25 * 0xc];
            uVar11 = auStack_5e8[uVar25 * 0xc + 1];
            uVar12 = (&local_5f0)[uVar26 * 0xc];
            fVar13 = (&fStack_5ec)[uVar26 * 0xc];
            uVar14 = auStack_5e8[uVar26 * 0xc];
            uVar15 = auStack_5e8[uVar26 * 0xc + 1];
            uVar16 = (&local_608)[uVar25 * 0xc];
            fVar17 = (&fStack_604)[uVar25 * 0xc];
            uVar18 = auStack_600[uVar25 * 0xc];
            uVar19 = auStack_600[uVar25 * 0xc + 1];
            uVar2 = (&uStack_5f8)[uVar25 * 6];
            uVar3 = auStack_5e0[uVar25 * 6];
            uVar25 = (&local_608)[uVar26 * 0xc];
            fVar20 = (&fStack_604)[uVar26 * 0xc];
            uVar21 = auStack_600[uVar26 * 0xc];
            uVar22 = auStack_600[uVar26 * 0xc + 1];
            uVar4 = (&uStack_5f8)[uVar26 * 6];
            uVar5 = auStack_5e0[uVar26 * 6];
            if ((uVar16 & uVar12 & uVar9 & uVar25) == 0) {
              puVar30[-1] = local_61c;
              puVar30[6] = (uint)local_614;
              *(undefined2 *)(puVar30 + 0xd) = (undefined2)local_60c;
              *(short *)(puVar30 + 0x14) = (short)((uint)local_60c >> 0x10);
              puVar30[-7] = uVar16;
              puVar30[-6] = (uint)fVar17;
              puVar30[-5] = uVar18;
              puVar30[-4] = uVar19;
              *puVar30 = uVar25;
              puVar30[1] = (uint)fVar20;
              puVar30[2] = uVar21;
              puVar30[3] = uVar22;
              puVar30[7] = uVar9;
              puVar30[8] = (uint)fVar32;
              puVar30[9] = uVar10;
              puVar30[10] = uVar11;
              puVar30[0xe] = uVar12;
              puVar30[0xf] = (uint)fVar13;
              puVar30[0x10] = uVar14;
              puVar30[0x11] = uVar15;
              *(undefined8 *)(puVar30 + -3) = uVar2;
              *(undefined8 *)(puVar30 + 4) = uVar4;
              *(undefined8 *)(puVar30 + 0xb) = uVar3;
              *(undefined8 *)(puVar30 + 0x12) = uVar5;
              FUN_00428550(puVar30 + -8);
              uVar25 = (&DAT_00790720)[iVar31];
              *local_610 = *(undefined4 *)(uVar25 & 0x7fffffff);
              *(undefined4 *)(uVar25 & 0x7fffffff) = local_610;
            }
          }
LAB_0042c5c1:
          local_610 = local_610 + 0x1e;
          puVar30 = puVar30 + 0x1e;
          uVar25 = uVar1;
        } while ((int)uVar1 < 0x20);
      }
    }
    local_628 = local_628 + 0x1e2c;
    if (0x12db7 < local_628) {
      __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
      return;
    }
  } while( true );
}

