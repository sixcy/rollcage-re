
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00429c00(uint param_1)

{
  short *psVar1;
  uint uVar2;
  uint *puVar3;
  uint *puVar4;
  uint uVar5;
  uint uVar6;
  undefined2 uVar7;
  int iVar8;
  char cVar9;
  char cVar10;
  byte bVar11;
  ushort uVar12;
  uint uVar13;
  uint *in_ECX;
  uint uVar14;
  uint uVar15;
  uint uVar16;
  uint *puVar17;
  uint *puVar18;
  uint *puVar19;
  bool bVar20;
  float10 fVar21;
  byte local_f08;
  uint *local_f00;
  uint local_efc;
  uint local_ef4;
  uint *local_ee4;
  uint local_ee0;
  undefined1 *local_edc;
  uint local_ed8;
  ushort *local_ed4;
  int local_ed0;
  uint *local_ecc;
  uint local_ec8;
  uint local_ec4;
  uint local_ec0;
  uint *local_ebc;
  uint *local_eb8;
  uint *local_eb4;
  uint *local_eb0;
  ushort *local_eac;
  uint *local_ea8;
  uint *local_ea4;
  uint *local_ea0;
  float local_e9c;
  uint local_e98;
  undefined1 *local_e94;
  uint local_e90;
  char local_e89;
  uint *local_e88 [2];
  undefined8 local_e80;
  undefined1 local_e78 [3164];
  undefined1 auStack_21c [4];
  uint local_218 [132];
  uint local_8;
  
  iVar8 = DAT_0069641c;
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  uVar13 = param_1 >> 0x13 & 2;
  bVar20 = false;
  local_ee4 = (uint *)0xffffffff;
  local_eb0 = (uint *)0xffffffff;
  local_f00 = (uint *)0xffffffff;
  local_ed4 = (ushort *)(DAT_00696adc * 0x124f >> 8);
  local_ea0 = (uint *)(DAT_00696adc * 0x753 >> 8);
  local_ed0 = 0;
  local_eac = (ushort *)DAT_00621538;
  if ((DAT_00519154 == 1) && (DAT_00621538 == 2)) {
    local_eac = (ushort *)0x0;
  }
  local_ea8 = in_ECX;
  if ((param_1 & 0x200000) == 0) {
    if ((param_1 & 0x400000) == 0) {
      local_ec8 = 0xffffffff;
      local_e90 = local_efc;
      local_e98 = local_efc;
      local_ecc = (uint *)0xffffffff;
      uVar7 = 0xffff;
    }
    else {
      DAT_005131f4 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
      local_ecc = (uint *)((*(ushort *)(DAT_00791594 + 0x2e) + 0xd9) * 0x10 + DAT_00791590);
      local_e90 = DAT_005131f4 >> 0x10 & 0x1f;
      local_e98 = DAT_005131f4 >> 0x18 & 0x1f;
      uVar7 = 0xffff;
      local_ec8 = 0xffffffff;
    }
  }
  else {
    local_e89 = PTR_DAT_00513210[0x2c1];
    uVar16 = DAT_0076a324;
    if (local_e89 == '\x01') {
      uVar16 = DAT_0076a324 >> 1;
    }
    uVar16 = (*(char *)((int)&DAT_00513260 + (uVar16 & 0x1f) * 0x10 + 1) + 0xc0) * (param_1 >> 0x18)
             >> 8;
    if ((param_1 & 0x800000) == 0) {
      local_ec8 = (int)(uVar16 << 5) >> 8;
      uVar15 = (int)(uVar16 * 0xff) >> 8;
      uVar16 = local_ec8;
    }
    else {
      FUN_0048c470(800,&local_ee0,&local_edc,&local_ed8);
      local_ec8 = local_ee0 * uVar16 >> 5;
      uVar15 = local_ed8 * uVar16 >> 5;
      uVar16 = (int)local_edc * uVar16 >> 5;
    }
    local_ec8 = (uVar15 << 8 | uVar16) << 8 | local_ec8;
    local_e90 = (int)((byte)((char)DAT_00660780 - 1) - 1) >> 1;
    local_e98 = (int)((byte)((char)DAT_00649b7c - 0x14) - 1) >> 1;
    local_ecc = local_eb0;
    uVar7 = (undefined2)DAT_00516be4;
  }
  puVar18 = DAT_00791574;
  uVar16 = param_1 & 0xffff;
  local_ee0 = uVar16 >> 5;
  if (((local_ee0 < 0x101) || (local_ee0 = (uVar16 >> 6) + 0x80, local_ee0 < 0x181)) ||
     (local_ee0 = (local_ee0 >> 1) + 0xc0, local_ee0 < 0x200)) {
    if (local_ee0 == 0) {
      local_ee0 = 1;
    }
  }
  else {
    local_ee0 = 0x1ff;
  }
  uVar15 = local_ea8[4];
  local_ed8 = DAT_00768dfc;
  if (*(short *)(uVar15 + 0x3c) < 0) {
    local_ed8 = uVar15;
  }
  puVar19 = (uint *)local_ea8[7];
  uVar14 = *local_ea8 & 0x1ff;
  if (((int)local_ea0 < (int)uVar16) && (uVar12 = *(ushort *)(uVar15 + 0x1c), uVar12 != 0)) {
    if ((int)local_ed4 < (int)uVar16) {
      if (*(ushort *)(uVar15 + 0x1e) != 0) {
        uVar15 = uVar15 + *(ushort *)(uVar15 + 0x1e);
        local_eb4 = (uint *)local_ea8[10];
        local_e88[1] = (uint *)(uint)*(byte *)((int)local_ea8 + 0x147);
        goto LAB_00429fff;
      }
      uVar12 = *(ushort *)(uVar15 + 0x1c);
    }
    uVar15 = uVar15 + uVar12;
    local_eb4 = (uint *)local_ea8[9];
    local_e88[1] = (uint *)(uint)*(byte *)((int)local_ea8 + 0x146);
  }
  else {
    local_eb4 = (uint *)local_ea8[8];
    local_e88[1] = (uint *)(uint)*(byte *)((int)local_ea8 + 0xf5);
    if ((uVar13 == 0) && ((uVar14 == 3 && ((int)uVar16 < DAT_00696adc * 0x5dc >> 8)))) {
      local_ed0 = 1;
      bVar20 = local_eac == (ushort *)0x2;
      local_ee4 = local_ea8 + 0xa62;
      local_eb0 = local_ea8 + 0xa74;
    }
  }
LAB_00429fff:
  uVar12 = *(ushort *)(uVar15 + 0x3c);
  if ((short)uVar12 < 0) {
    local_eac = (ushort *)((uVar12 & 0x7fff) + local_ed8);
  }
  else {
    local_eac = (ushort *)(DAT_00768da0 + (uint)uVar12 * 2);
  }
  local_ed4 = (ushort *)(*(int *)(uVar15 + 0x10) + uVar15);
  local_e94 = local_e78;
  local_ea0 = DAT_00791574;
  if (uVar14 == 3) {
    _DAT_00696224 = *puVar19;
    _DAT_00696228 = puVar19[1];
    (*DAT_0069633c)(local_e78);
    puVar17 = local_e88[1];
    if (local_e88[1] != (uint *)0x0) {
      do {
        (*DAT_00696344)();
        _DAT_00696224 = puVar19[2];
        local_e94 = local_e94 + 0x18;
        _DAT_00696228 = puVar19[3];
        (*DAT_0069633c)(local_e94);
        puVar17 = (uint *)((int)puVar17 - 1);
        puVar18 = local_ea0;
        puVar19 = puVar19 + 2;
      } while (0 < (int)puVar17);
    }
    (*DAT_00696344)();
  }
  else {
    local_e80._0_4_ = *(uint **)(uVar15 + 0x48);
    local_e88[0] = local_218;
    _DAT_00696224 = *puVar19;
    _DAT_00696228 = puVar19[1];
    (*DAT_0069633c)(local_e78);
    psVar1 = (short *)((int)(uint *)local_e80 + 8);
    _DAT_00696228 = -(int)*(short *)((int)(uint *)local_e80 + 4);
    _DAT_00696224 =
         *(short *)((int)(uint *)local_e80 + 2) * -0x10000 |
         -(int)*(short *)(uint *)local_e80 & 0xffffU;
    puVar17 = local_e88[1];
    local_e80._0_4_ = (uint *)psVar1;
    if (local_e88[1] != (uint *)0x0) {
      do {
        (*DAT_00696344)();
        (*DAT_006963d4)();
        *local_e88[0] = DAT_0069627c;
        _DAT_00696224 = puVar19[2];
        local_e94 = local_e94 + 0x18;
        _DAT_00696228 = puVar19[3];
        (*DAT_0069633c)(local_e94);
        local_e88[0] = local_e88[0] + 1;
        puVar17 = (uint *)((int)puVar17 - 1);
        _DAT_00696228 = -(int)*(short *)((int)(uint *)local_e80 + 4);
        psVar1 = (short *)((int)(uint *)local_e80 + 8);
        _DAT_00696224 =
             -(int)*(short *)(uint *)local_e80 & 0xffffU |
             *(short *)((int)(uint *)local_e80 + 2) * -0x10000;
        puVar18 = local_ea0;
        puVar19 = puVar19 + 2;
        local_e80._0_4_ = (uint *)psVar1;
      } while (0 < (int)puVar17);
    }
    (*DAT_00696344)();
    (*DAT_006963d4)();
    *local_e88[0] = DAT_0069627c;
    local_edc = auStack_21c;
  }
  local_e94 = (undefined1 *)(local_ea8[7] - 8);
  if (local_ed0 != 0) {
    local_ea8[0xa75] = (uint)puVar18;
    local_f00 = local_eb4 + 2;
  }
  uVar16 = 0x80000000;
  do {
    puVar19 = puVar18 + 0x1a;
    local_ef4 = (uint)*local_ed4;
    local_ed4 = local_ed4 + 1;
    local_e80._0_4_ = puVar18 + 0x12;
    local_e88[1] = puVar18 + 10;
    local_ea0 = (uint *)((int)local_eb4 - (int)local_f00);
    local_e88[0] = puVar18 + 2;
    do {
      local_ea0 = (uint *)((int)local_ea0 + 8);
      local_e80._4_4_ = *local_eb4;
      local_eb4 = local_eb4 + 2;
      local_ec4 = local_e80._4_4_ >> 8 & 0xff;
      uVar15 = local_e80._4_4_ & 0xff;
      local_ec0 = local_e80._4_4_ >> 0x10 & 0xff;
      local_e80._4_4_ = local_e80._4_4_ >> 0x18;
      puVar17 = &local_e90 + uVar15 * 6;
      local_eb8 = &local_e90 + local_ec4 * 6;
      local_ebc = &local_e90 + local_ec0 * 6;
      fVar21 = (float10)FUN_004a50a0(puVar17,local_eb8,local_ebc);
      local_e9c = (float)fVar21;
      if (iVar8 != 0) {
        local_e9c = (float)((uint)local_e9c ^ uVar16);
      }
      local_ef4 = local_ef4 - 8;
      if (local_e80._4_4_ == 0) {
        local_ea4 = local_ebc;
LAB_0042a3ce:
        if ((int)local_e9c < 0) goto LAB_0042a3db;
      }
      else {
        local_ea4 = &local_e90 + local_e80._4_4_ * 6;
        if (-1 < (int)local_e9c) {
          fVar21 = (float10)FUN_004a50a0(local_eb8,local_ea4,local_ebc);
          local_e9c = (float)fVar21;
          if (iVar8 != 0) {
            local_e9c = (float)((uint)local_e9c ^ uVar16);
          }
          goto LAB_0042a3ce;
        }
LAB_0042a3db:
        if ((*puVar17 & *local_ea4 & *local_ebc & *local_eb8) == 0) {
          local_e9c = *(float *)((int)local_f00 + (int)local_ea0 + -4);
          local_efc._0_1_ = (byte)((uint)local_e9c >> 0x1e) & 2;
          uVar2 = *(uint *)(&stack0xfffff174 + uVar15 * 0x18);
          puVar3 = local_e88[uVar15 * 6];
          puVar4 = local_e88[uVar15 * 6 + 1];
          *local_e88[0] = *puVar17;
          local_e88[0][1] = uVar2;
          local_e88[0][2] = (uint)puVar3;
          local_e88[0][3] = (uint)puVar4;
          *(undefined8 *)(local_e88[0] + 4) = (&local_e80)[uVar15 * 3];
          uVar2 = local_ebc[1];
          uVar5 = local_ebc[2];
          uVar6 = local_ebc[3];
          *local_e88[1] = *local_ebc;
          local_e88[1][1] = uVar2;
          local_e88[1][2] = uVar5;
          local_e88[1][3] = uVar6;
          *(undefined8 *)(local_e88[1] + 4) = *(undefined8 *)(local_ebc + 4);
          uVar2 = local_eb8[1];
          uVar5 = local_eb8[2];
          uVar6 = local_eb8[3];
          *(uint *)local_e80 = *local_eb8;
          ((uint *)local_e80)[1] = uVar2;
          ((uint *)local_e80)[2] = uVar5;
          ((uint *)local_e80)[3] = uVar6;
          uVar2 = local_eb8[5];
          ((uint *)local_e80)[4] = local_eb8[4];
          ((uint *)local_e80)[5] = uVar2;
          if ((param_1 & 0x600000) == 0) {
            puVar17 = (uint *)(*local_eac + local_ed8);
            puVar18[8] = *puVar17;
            puVar18[0x10] = puVar17[1];
            local_eb8 = (uint *)puVar17[2];
            *(short *)(puVar18 + 0x18) = (short)local_eb8;
            if (uVar14 == 3) {
              _DAT_00696228 = -(((int)local_e9c << 0x16) >> 0x12);
              _DAT_00696224 =
                   -((int)(((uint)local_e9c & 0xffffffc0) << 0xc) >> 2) |
                   -((int)local_e9c * 4 >> 0x12) & 0xffffU;
              (*DAT_006963d4)();
              uVar15 = DAT_0069627c;
              uVar16 = 0x80000000;
              puVar18[1] = DAT_0069627c;
              puVar18[0x11] = uVar15;
              puVar18[9] = uVar15;
              if (local_e80._4_4_ != 0) {
                uVar2 = local_ea4[1];
                uVar5 = local_ea4[2];
                uVar6 = local_ea4[3];
                *puVar19 = *local_ea4;
                puVar19[1] = uVar2;
                puVar19[2] = uVar5;
                puVar19[3] = uVar6;
                uVar2 = local_ea4[5];
                puVar19[4] = local_ea4[4];
                puVar19[5] = uVar2;
                puVar18[0x19] = uVar15;
                *(short *)(puVar18 + 0x20) = (short)((uint)local_eb8 >> 0x10);
              }
            }
            else {
              puVar18[1] = *(uint *)(local_edc + uVar15 * 4);
              puVar18[0x11] = *(uint *)(local_edc + local_ec4 * 4);
              puVar18[9] = *(uint *)(local_edc + local_ec0 * 4);
              if (local_e80._4_4_ != 0) {
                uVar15 = local_ea4[1];
                uVar2 = local_ea4[2];
                uVar5 = local_ea4[3];
                *puVar19 = *local_ea4;
                puVar19[1] = uVar15;
                puVar19[2] = uVar2;
                puVar19[3] = uVar5;
                uVar15 = local_ea4[5];
                puVar19[4] = local_ea4[4];
                puVar19[5] = uVar15;
                puVar18[0x19] = *(uint *)(local_edc + local_e80._4_4_ * 4);
                *(short *)(puVar18 + 0x20) = (short)((uint)local_eb8 >> 0x10);
              }
            }
          }
          else {
            cVar10 = (char)local_e98;
            if ((param_1 & 0x200000) == 0) {
              if ((param_1 & 0x400000) != 0) {
                *(undefined2 *)((int)puVar18 + 0x42) = *(undefined2 *)((int)local_ecc + 6);
                puVar18[1] = 0xffff00;
                puVar18[9] = 0xffff00;
                puVar18[0x11] = 0xffff00;
                cVar9 = (char)*local_ecc + (char)local_e90;
                *(char *)(puVar18 + 0x18) = cVar9;
                *(char *)(puVar18 + 8) = cVar9;
                cVar9 = *(char *)((int)local_ecc + 1) + cVar10;
                *(char *)((int)puVar18 + 0x41) = cVar9;
                *(char *)((int)puVar18 + 0x21) = cVar9;
                cVar9 = (char)*local_ecc + (char)local_e90 + '\b';
                *(char *)(puVar18 + 0x20) = cVar9;
                *(char *)(puVar18 + 0x10) = cVar9;
                cVar10 = *(char *)((int)local_ecc + 1) + cVar10 + '\b';
                *(char *)((int)puVar18 + 0x81) = cVar10;
                *(char *)((int)puVar18 + 0x61) = cVar10;
                local_e90 = local_e90 + 7 & 0x1f;
                local_e98 = local_e98 + 7 & 0x1f;
                if (local_e80._4_4_ != 0) {
                  uVar15 = local_ea4[1];
                  uVar2 = local_ea4[2];
                  uVar5 = local_ea4[3];
                  *puVar19 = *local_ea4;
                  puVar19[1] = uVar15;
                  puVar19[2] = uVar2;
                  puVar19[3] = uVar5;
                  uVar15 = local_ea4[5];
                  puVar19[4] = local_ea4[4];
                  puVar19[5] = uVar15;
                  puVar18[0x19] = 0xff4040;
                }
              }
            }
            else {
              *(undefined2 *)((int)puVar18 + 0x42) = uVar7;
              puVar18[1] = local_ec8;
              puVar18[9] = local_ec8;
              puVar18[0x11] = local_ec8;
              cVar9 = (char)(*(short *)((int)local_e94 + 2 + uVar15 * 8) >> 1);
              *(char *)(puVar18 + 8) =
                   *(char *)((int)local_e94 + uVar15 * 8) + (char)local_e90 + cVar9;
              *(char *)((int)puVar18 + 0x21) =
                   *(char *)((int)local_e94 + 4 + uVar15 * 8) + cVar10 + cVar9;
              cVar9 = (char)(*(short *)((int)local_e94 + 2 + local_ec0 * 8) >> 1);
              *(char *)(puVar18 + 0x10) =
                   *(char *)((int)local_e94 + local_ec0 * 8) + (char)local_e90 + cVar9;
              *(char *)((int)puVar18 + 0x41) =
                   *(char *)((int)local_e94 + 4 + local_ec0 * 8) + cVar10 + cVar9;
              cVar9 = (char)(*(short *)((int)local_e94 + 2 + local_ec4 * 8) >> 1);
              *(char *)(puVar18 + 0x18) =
                   *(char *)((int)local_e94 + local_ec4 * 8) + (char)local_e90 + cVar9;
              *(char *)((int)puVar18 + 0x61) =
                   *(char *)((int)local_e94 + 4 + local_ec4 * 8) + cVar10 + cVar9;
              if (local_e80._4_4_ != 0) {
                uVar15 = local_ea4[1];
                uVar2 = local_ea4[2];
                uVar5 = local_ea4[3];
                *puVar19 = *local_ea4;
                puVar19[1] = uVar15;
                puVar19[2] = uVar2;
                puVar19[3] = uVar5;
                uVar15 = local_ea4[4];
                uVar2 = local_ea4[5];
                puVar18[0x19] = local_ec8;
                puVar19[4] = uVar15;
                puVar19[5] = uVar2;
                cVar9 = (char)(*(short *)((int)local_e94 + 2 + local_e80._4_4_ * 8) >> 1);
                *(char *)(puVar18 + 0x20) =
                     *(char *)((int)local_e94 + local_e80._4_4_ * 8) + (char)local_e90 + cVar9;
                *(char *)((int)puVar18 + 0x81) =
                     *(char *)((int)local_e94 + 4 + local_e80._4_4_ * 8) + cVar10 + cVar9;
              }
            }
          }
          if (bVar20) {
            *(ushort *)((int)puVar18 + 0x42U) = *(ushort *)((int)puVar18 + 0x42U) & 0x3f;
            *(char *)((int)puVar18 + 7) = (local_e80._4_4_ != 0) * '\x04' + -0x40;
            uVar12 = 0x80;
            if (*(char *)((int)local_ea8 + 0x29e1) != '\0') {
              uVar12 = 0x40;
            }
            *(ushort *)((int)puVar18 + 0x42U) = *(ushort *)((int)puVar18 + 0x42U) | uVar12;
          }
          else {
            bVar11 = 0x9c;
            if (local_e80._4_4_ != 0) {
              bVar11 = 0x8c;
            }
            local_f08 = (byte)uVar13;
            *(byte *)((int)puVar18 + 7) = bVar11 | local_f08 | (byte)local_efc;
          }
          if ((*(byte *)((int)puVar18 + 7) & 2) == 0) {
            uVar15 = (&DAT_0078feb8)[(*(ushort *)((int)puVar18 + 0x42) & 0x7f) * 4];
          }
          else {
            uVar15 = (&DAT_00790720)[local_ee0];
          }
          *puVar18 = *(uint *)(uVar15 & 0x7fffffff);
          *(uint *)(uVar15 & 0x7fffffff) = (uint)puVar18;
          if ((local_ed0 != 0) && (local_ee4 < local_eb0)) {
            *(char *)local_ee4 = (char)((int)local_ea0 >> 3);
            local_ee4 = (uint *)((int)local_ee4 + 1);
          }
          if (*(byte *)((int)puVar18 + 7) < 0xc0) {
            if (local_e80._4_4_ == 0) {
              local_e88[0] = local_e88[0] + 0x19;
              puVar18 = puVar18 + 0x19;
              local_e88[1] = local_e88[1] + 0x19;
              local_e80._0_4_ = (uint *)local_e80 + 0x19;
              puVar19 = puVar19 + 0x19;
            }
            else {
              local_e88[0] = local_e88[0] + 0x21;
              puVar18 = puVar18 + 0x21;
              local_e88[1] = local_e88[1] + 0x21;
              local_e80._0_4_ = (uint *)local_e80 + 0x21;
              puVar19 = puVar19 + 0x21;
            }
          }
          else {
            local_e88[0] = local_e88[0] + 0x29;
            puVar18 = puVar18 + 0x29;
            local_e88[1] = local_e88[1] + 0x29;
            local_e80._0_4_ = (uint *)local_e80 + 0x29;
            puVar19 = puVar19 + 0x29;
          }
        }
      }
      local_eac = local_eac + 1;
    } while (0 < (int)local_ef4);
    if ((local_ef4 & 4) != 0) {
      DAT_00791574 = puVar18;
      if (local_ed0 != 0) {
        local_ea8[0xa74] = (uint)local_ee4;
        *(undefined1 *)(local_ea8 + 0xa78) = 1;
      }
      __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
      return;
    }
  } while( true );
}

