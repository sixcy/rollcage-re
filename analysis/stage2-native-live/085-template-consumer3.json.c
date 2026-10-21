
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0043fcb0(void)

{
  undefined2 uVar1;
  undefined2 uVar2;
  undefined2 uVar3;
  uint uVar4;
  int iVar5;
  short sVar6;
  char cVar7;
  int iVar8;
  int iVar9;
  undefined1 uVar10;
  undefined1 uVar11;
  int iVar12;
  uint uVar13;
  uint uVar14;
  int iVar15;
  int iVar16;
  uint *puVar17;
  uint *in_ECX;
  uint uVar18;
  int iVar19;
  uint uVar20;
  uint uVar21;
  int iVar22;
  uint *puVar23;
  uint *puVar24;
  undefined4 *puVar25;
  undefined4 *puVar26;
  bool bVar27;
  uint local_240;
  uint *local_23c;
  uint local_234;
  uint local_230;
  uint local_220;
  uint *local_218;
  undefined4 local_214;
  short local_210;
  uint local_20c;
  undefined4 local_208;
  short local_204;
  undefined4 local_200;
  short local_1fc;
  uint local_1f8;
  uint local_1f4;
  int local_1f0;
  uint *local_1ec;
  uint local_1e8;
  uint local_1e4;
  int local_1e0;
  int local_1dc;
  int local_1d8;
  int local_1d4;
  uint local_1d0;
  uint local_1cc;
  undefined4 *local_1c8;
  int local_1c4;
  int local_1c0;
  int *local_1bc;
  int local_1b8;
  uint local_1b4;
  uint local_1b0;
  uint local_1ac [82];
  uint local_64 [23];
  uint local_8;
  
  iVar8 = DAT_00621538;
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  local_1d0 = 0x8cffffff;
  uVar4 = *in_ECX;
  puVar23 = in_ECX + 1;
  local_1f8 = 0;
  uVar1 = 0;
  uVar2 = 0;
  uVar3 = 0;
  local_1cc = 0;
  local_220 = 0;
  iVar12 = FUN_00444880();
  iVar9 = DAT_00791588;
  local_1f0 = DAT_0060e2f8;
  iVar5 = DAT_00791598[1];
  local_1b0 = 0;
  local_23c = (uint *)0x0;
  if ((DAT_0051321c != DAT_0060e30c) || (local_234 = 0, DAT_0060e310 != DAT_0060e308)) {
    local_234 = 1;
  }
  _DAT_0069623c = local_1d0;
  local_240 = 0;
  if (uVar4 != 0) {
    do {
      local_230 = (uint)(ushort)puVar23[1];
      uVar20 = (uint)*(ushort *)((int)puVar23 + 2);
      local_1d0 = (uint)*(ushort *)((int)puVar23 + 6);
      local_1e4 = *(int *)(*DAT_00791598 + (uint)(ushort)*puVar23 * 4);
      iVar16 = (&DAT_0076bd00)[local_240];
      local_1d4 = *(int *)(local_1e4 + 8);
      uVar13 = local_1d4 + 1;
      local_1bc = (int *)(*(int *)(local_1e4 + 0x20) + uVar13 * uVar20 * 8);
      if ((iVar8 == 0) || (local_1d0 != 1)) {
        local_1c8 = (undefined4 *)0x0;
        if (local_1d0 == 1) goto LAB_0043fe84;
        cVar7 = (char)*(ushort *)((int)puVar23 + 6);
        puVar17 = *(uint **)(local_1e4 + 0x20 + local_1d0 * 4);
        local_1dc = (uVar13 * 8 << (cVar7 - 1U & 0x1f)) + uVar13 * -8;
        local_1e8 = *puVar17 & 0xffff;
        local_1d4 = local_1e8 - 1;
        iVar19 = (local_1d4 >> 1) + 1;
        if (iVar19 != 0) {
          puVar24 = local_64;
          for (; puVar17 = puVar17 + 1, iVar19 != 0; iVar19 = iVar19 + -1) {
            *puVar24 = *puVar17;
            puVar24 = puVar24 + 1;
          }
        }
        local_1e0 = *(int *)(local_1e4 + 0x4c + local_1d0 * 4) +
                    ((int)uVar20 >> (cVar7 - 1U & 0x1f)) * local_1d4 * 8;
      }
      else {
        local_1c8 = (undefined4 *)
                    (*(int *)(*(int *)(DAT_00791598[0x29] + (uint)(ushort)*puVar23 * 4) + 4) +
                    uVar13 * uVar20 * 0x14);
LAB_0043fe84:
        local_1dc = 0;
        if (0 < (int)uVar13) {
          puVar17 = local_64;
          for (uVar18 = uVar13 >> 1; uVar18 != 0; uVar18 = uVar18 - 1) {
            *puVar17 = 0x80008;
            puVar17 = puVar17 + 1;
          }
          for (uVar18 = (uint)((uVar13 & 1) != 0); uVar18 != 0; uVar18 = uVar18 - 1) {
            *(undefined2 *)puVar17 = 8;
            puVar17 = (uint *)((int)puVar17 + 2);
          }
        }
        local_1e0 = *(int *)(local_1e4 + 0x50) + local_1d4 * uVar20 * 8;
        local_1e8 = uVar13;
      }
      uVar18 = local_1e8;
      puVar17 = local_1ac;
      local_1d4 = -local_1d4;
      local_1d8 = local_1e8 + 1;
      uVar20 = (&DAT_0076ad40)[iVar16];
      iVar19 = local_1e8 * 2;
      if (local_1cc != 0) {
        local_1f8 = local_220;
      }
      local_218 = (uint *)(&DAT_0076ad44 + iVar16 * 4);
      local_1cc = uVar20 & 0x80000000 | local_234;
      local_1f4 = uVar20;
      local_1ec = puVar17;
      if (local_1cc == 0) {
        local_1bc = (int *)((int)local_1bc + local_1dc + uVar13 * 8);
        iVar16 = local_1d4;
        local_1d4 = local_1d8;
        if (local_1c8 != (undefined4 *)0x0) {
          local_1c8 = local_1c8 + uVar13 * 5;
          local_1d4 = local_1d8;
        }
      }
      else {
        if (local_1f8 != uVar20) {
          uVar21 = uVar20 ^ local_1f8;
          if ((uVar21 & 0x3ff) != 0) {
            uVar14 = uVar20 & 0x3ff;
            if (uVar14 == 0) {
              local_1b0 = local_1b0 & 6;
            }
            else {
              local_200 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar14 * 0x38),
                                   *(undefined2 *)(&DAT_0076bf02 + uVar14 * 0x38));
              local_1fc = *(short *)(&DAT_0076bf0a + uVar14 * 0x38);
              uVar1 = *(undefined2 *)(&DAT_0076bf10 + uVar14 * 0x38);
              local_1b0 = local_1b0 | 1;
            }
          }
          if ((uVar21 & 0xffc00) != 0) {
            uVar14 = uVar20 >> 10 & 0x3ff;
            if (uVar14 == 0) {
              local_1b0 = local_1b0 & 5;
            }
            else {
              local_214 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar14 * 0x38),
                                   *(undefined2 *)(&DAT_0076bf02 + uVar14 * 0x38));
              local_210 = *(short *)(&DAT_0076bf0a + uVar14 * 0x38);
              uVar2 = *(undefined2 *)(&DAT_0076bf10 + uVar14 * 0x38);
              local_1b0 = local_1b0 | 2;
            }
          }
          if ((uVar21 & 0x3ff00000) != 0) {
            uVar21 = uVar20 >> 0x14 & 0x3ff;
            if (uVar21 == 0) {
              local_1b0 = local_1b0 & 3;
            }
            else {
              local_208 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar21 * 0x38),
                                   *(undefined2 *)(&DAT_0076bf02 + uVar21 * 0x38));
              local_204 = *(short *)(&DAT_0076bf0a + uVar21 * 0x38);
              uVar3 = *(undefined2 *)(&DAT_0076bf10 + uVar21 * 0x38);
              local_1b0 = local_1b0 | 4;
            }
          }
          FUN_004a65c0();
        }
        iVar16 = 0;
        uVar21 = 0;
        local_1b8 = 0;
        local_1b4 = 0;
        local_1c0 = 0;
        puVar26 = local_1c8;
        local_1e4 = uVar18;
        while (local_1c8 = puVar26, local_1e4 != 0) {
          if (local_1b0 != 0) {
            local_1c4 = *local_1bc;
            sVar6 = (short)local_1bc[1];
            if ((local_1b0 & 1) != 0) {
              iVar15 = (int)(short)(local_1c4 - local_200);
              iVar16 = (int)(short)((uint)(local_1c4 - local_200) >> 0x10);
              iVar16 = (int)(short)(sVar6 - local_1fc) * (int)(short)(sVar6 - local_1fc) +
                       iVar15 * iVar15 + iVar16 * iVar16 >> ((byte)uVar1 & 0x1f);
              uVar21 = local_1b4;
              if (iVar16 < 0) {
                local_1c0 = 0;
              }
              else if (iVar16 < 0x400) {
                local_1c0 = *(int *)(local_1f0 + iVar16 * 4);
              }
              else {
                local_1c0 = 0;
              }
            }
            if ((local_1b0 & 2) != 0) {
              iVar15 = (int)(short)(local_1c4 - local_214);
              iVar16 = (int)(short)((uint)(local_1c4 - local_214) >> 0x10);
              iVar16 = (int)(short)(sVar6 - local_210) * (int)(short)(sVar6 - local_210) +
                       iVar15 * iVar15 + iVar16 * iVar16 >> ((byte)uVar2 & 0x1f);
              if (iVar16 < 0) {
                uVar21 = 0;
                local_1b4 = uVar21;
              }
              else if (iVar16 < 0x400) {
                uVar21 = *(uint *)(local_1f0 + iVar16 * 4);
                local_1b4 = uVar21;
              }
              else {
                uVar21 = 0;
                local_1b4 = uVar21;
              }
            }
            iVar16 = local_1b8;
            if ((local_1b0 & 4) != 0) {
              iVar15 = (int)(short)(local_1c4 - local_208);
              iVar16 = (int)(short)((uint)(local_1c4 - local_208) >> 0x10);
              iVar16 = (int)(short)(sVar6 - local_204) * (int)(short)(sVar6 - local_204) +
                       iVar15 * iVar15 + iVar16 * iVar16 >> ((byte)uVar3 & 0x1f);
              uVar21 = local_1b4;
              if (iVar16 < 0) {
                local_1b8 = 0;
                iVar16 = 0;
              }
              else if (iVar16 < 0x400) {
                local_1b8 = *(int *)(local_1f0 + iVar16 * 4);
                iVar16 = local_1b8;
              }
              else {
                local_1b8 = 0;
                iVar16 = 0;
              }
            }
          }
          *puVar17 = *(uint *)(iVar12 + ((uint)local_1bc[1] >> 0x16) * 4);
          if (puVar26 != (undefined4 *)0x0) {
            *puVar26 = 0;
          }
          if ((iVar16 != 0 || uVar21 != 0) || local_1c0 != 0) {
            DAT_00696250 = (short)iVar16;
            uVar18 = *puVar17;
            DAT_006961d4 = (uVar18 & 0xff) << 4 | 0xf;
            DAT_00696248 = (short)local_1c0;
            DAT_0069624c = (short)uVar21;
            DAT_006961d8 = (uVar18 & 0xff00 | 0xf0) >> 4;
            DAT_006961dc = (uVar18 & 0xff0000 | 0xf000) >> 0xc;
            _DAT_006963c8 = (float)DAT_006961d4;
            _DAT_006963cc = (float)DAT_006961d8;
            _DAT_006963d0 = (float)DAT_006961dc;
            iVar15 = (int)DAT_0069624c;
            iVar16 = (int)DAT_00696248;
            iVar22 = (int)DAT_00696250;
            local_20c = (int)(DAT_006961e0 * iVar16 + DAT_006961e2 * iVar15 + DAT_006961e4 * iVar22
                             + DAT_006961d4 * 0x1000) >> 8;
            uVar18 = (_DAT_0069623c & 0xff) * local_20c;
            uVar10 = (undefined1)(uVar18 >> 0x10);
            if (0xff < uVar18 >> 0x10) {
              uVar10 = 0xff;
            }
            uVar18 = (_DAT_0069623c >> 8 & 0xff) *
                     ((int)(DAT_006961e6 * iVar16 + DAT_006961e8 * iVar15 + DAT_006961ea * iVar22 +
                           DAT_006961d8 * 0x1000) >> 8);
            uVar11 = (undefined1)(uVar18 >> 0x10);
            if (0xff < uVar18 >> 0x10) {
              uVar11 = 0xff;
            }
            uVar18 = (_DAT_0069623c >> 0x10 & 0xff) *
                     ((int)(DAT_006961ec * iVar16 + DAT_006961ee * iVar15 + DAT_006961f0 * iVar22 +
                           DAT_006961dc * 0x1000) >> 8);
            DAT_0069627c._0_2_ = CONCAT11(uVar11,uVar10);
            uVar10 = (undefined1)(uVar18 >> 0x10);
            if (0xff < uVar18 >> 0x10) {
              uVar10 = 0xff;
            }
            DAT_0069627c._0_3_ = CONCAT12(uVar10,(undefined2)DAT_0069627c);
            DAT_0069627c = CONCAT13(DAT_0069623f,(undefined3)DAT_0069627c);
            *local_1ec = DAT_0069627c;
            iVar16 = local_1b8;
            uVar21 = local_1b4;
            puVar17 = local_1ec;
            if ((puVar26 != (undefined4 *)0x0) && (puVar26[1] != 0)) {
              FUN_0049c5b0(&local_214,local_1b4,&local_208,local_1b8,local_1f4,puVar26);
              iVar16 = local_1b8;
              uVar21 = local_1b4;
            }
          }
          puVar17 = puVar17 + 1;
          local_1e4 = local_1e4 - 1;
          local_1bc = (int *)((int)local_1bc + (uint)*(ushort *)((int)local_64 + local_1e4 * 2));
          bVar27 = puVar26 == (undefined4 *)0x0;
          puVar26 = puVar26 + 5;
          local_1ec = puVar17;
          if (bVar27) {
            puVar26 = (undefined4 *)0x0;
          }
        }
        local_1bc = (int *)((int)local_1bc + local_1dc);
        local_1e4 = 0;
        local_220 = uVar20;
        iVar16 = local_1d8;
      }
      local_1d8 = iVar16;
      puVar26 = local_1c8;
      if (local_230 != 0) {
        do {
          if (local_1cc != 0) {
            local_1f8 = local_220;
          }
          uVar20 = *local_218;
          local_218 = local_218 + 1;
          uVar18 = uVar20 & 0x80000000 | local_234;
          local_20c = uVar20;
          local_1f4 = local_1cc;
          if (local_1cc == 0 && uVar18 == 0) {
            local_1bc = (int *)((int)local_1bc + local_1dc + uVar13 * 8);
            if (puVar26 != (undefined4 *)0x0) {
              puVar26 = puVar26 + uVar13 * 5;
              local_1c8 = puVar26;
            }
            local_1e0 = local_1e0 + local_1e8 * 8;
            iVar16 = local_1d8;
            local_1cc = uVar18;
          }
          else {
            if ((uVar18 != 0) && (local_1f8 != uVar20)) {
              uVar21 = uVar20 ^ local_1f8;
              if ((uVar21 & 0x3ff) != 0) {
                uVar14 = uVar20 & 0x3ff;
                if (uVar14 == 0) {
                  local_1b0 = local_1b0 & 6;
                }
                else {
                  local_200 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar14 * 0x38),
                                       *(undefined2 *)(&DAT_0076bf02 + uVar14 * 0x38));
                  local_1fc = *(short *)(&DAT_0076bf0a + uVar14 * 0x38);
                  uVar1 = *(undefined2 *)(&DAT_0076bf10 + uVar14 * 0x38);
                  local_1b0 = local_1b0 | 1;
                }
              }
              if ((uVar21 & 0xffc00) != 0) {
                uVar14 = uVar20 >> 10 & 0x3ff;
                if (uVar14 == 0) {
                  local_1b0 = local_1b0 & 5;
                }
                else {
                  local_214 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar14 * 0x38),
                                       *(undefined2 *)(&DAT_0076bf02 + uVar14 * 0x38));
                  local_210 = *(short *)(&DAT_0076bf0a + uVar14 * 0x38);
                  uVar2 = *(undefined2 *)(&DAT_0076bf10 + uVar14 * 0x38);
                  local_1b0 = local_1b0 | 2;
                }
              }
              if ((uVar21 & 0x3ff00000) != 0) {
                uVar21 = uVar20 >> 0x14 & 0x3ff;
                if (uVar21 == 0) {
                  local_1b0 = local_1b0 & 3;
                }
                else {
                  local_208 = CONCAT22(*(undefined2 *)(&DAT_0076bf06 + uVar21 * 0x38),
                                       *(undefined2 *)(&DAT_0076bf02 + uVar21 * 0x38));
                  local_204 = *(short *)(&DAT_0076bf0a + uVar21 * 0x38);
                  uVar3 = *(undefined2 *)(&DAT_0076bf10 + uVar21 * 0x38);
                  local_1b0 = local_1b0 | 4;
                }
              }
              local_1cc = uVar18;
              FUN_004a65c0();
              uVar18 = local_1cc;
            }
            local_1cc = uVar18;
            local_1c0 = 0;
            local_1b8 = 0;
            local_1c4 = 0;
            puVar24 = puVar17;
            local_1e4 = local_1e8;
            while (local_1e4 != 0) {
              local_1b4 = local_1bc[1];
              puVar25 = puVar26;
              if (local_1cc != 0) {
                if (local_1b0 != 0) {
                  iVar16 = *local_1bc;
                  sVar6 = (short)local_1b4;
                  if ((local_1b0 & 1) != 0) {
                    iVar22 = (int)(short)(iVar16 - local_200);
                    iVar15 = (int)(short)((uint)(iVar16 - local_200) >> 0x10);
                    iVar15 = (int)(short)(sVar6 - local_1fc) * (int)(short)(sVar6 - local_1fc) +
                             iVar22 * iVar22 + iVar15 * iVar15 >> ((byte)uVar1 & 0x1f);
                    if (iVar15 < 0) {
                      local_1c4 = 0;
                    }
                    else if (iVar15 < 0x400) {
                      local_1c4 = *(int *)(local_1f0 + iVar15 * 4);
                    }
                    else {
                      local_1c4 = 0;
                    }
                  }
                  if ((local_1b0 & 2) != 0) {
                    iVar22 = (int)(short)(iVar16 - local_214);
                    iVar15 = (int)(short)((uint)(iVar16 - local_214) >> 0x10);
                    iVar15 = (int)(short)(sVar6 - local_210) * (int)(short)(sVar6 - local_210) +
                             iVar22 * iVar22 + iVar15 * iVar15 >> ((byte)uVar2 & 0x1f);
                    if (iVar15 < 0) {
                      local_1b8 = 0;
                    }
                    else if (iVar15 < 0x400) {
                      local_1b8 = *(int *)(local_1f0 + iVar15 * 4);
                    }
                    else {
                      local_1b8 = 0;
                    }
                  }
                  if ((local_1b0 & 4) != 0) {
                    iVar15 = (int)(short)(iVar16 - local_208);
                    iVar16 = (int)(short)((uint)(iVar16 - local_208) >> 0x10);
                    iVar16 = (int)(short)(sVar6 - local_204) * (int)(short)(sVar6 - local_204) +
                             iVar15 * iVar15 + iVar16 * iVar16 >> ((byte)uVar3 & 0x1f);
                    if (iVar16 < 0) {
                      local_1c0 = 0;
                    }
                    else if (iVar16 < 0x400) {
                      local_1c0 = *(int *)(local_1f0 + iVar16 * 4);
                    }
                    else {
                      local_1c0 = 0;
                    }
                  }
                }
                *local_1ec = *(uint *)(iVar12 + (local_1b4 >> 0x16) * 4);
                if (puVar26 != (undefined4 *)0x0) {
                  *puVar26 = 0;
                }
                puVar24 = local_1ec;
                if ((local_1c0 != 0 || local_1b8 != 0) || local_1c4 != 0) {
                  uVar18 = *local_1ec;
                  DAT_00696248 = (short)local_1c4;
                  DAT_006961d4 = (uVar18 & 0xff) << 4 | 0xf;
                  DAT_0069624c = (short)local_1b8;
                  DAT_00696250 = (short)local_1c0;
                  DAT_006961d8 = (uVar18 & 0xff00 | 0xf0) >> 4;
                  DAT_006961dc = (uVar18 & 0xff0000 | 0xf000) >> 0xc;
                  _DAT_006963c8 = (float)DAT_006961d4;
                  _DAT_006963cc = (float)DAT_006961d8;
                  _DAT_006963d0 = (float)DAT_006961dc;
                  iVar15 = (int)DAT_0069624c;
                  iVar16 = (int)DAT_00696248;
                  iVar22 = (int)DAT_00696250;
                  uVar18 = (_DAT_0069623c & 0xff) *
                           ((int)(DAT_006961e0 * iVar16 + DAT_006961e2 * iVar15 +
                                  DAT_006961e4 * iVar22 + DAT_006961d4 * 0x1000) >> 8);
                  uVar10 = (undefined1)(uVar18 >> 0x10);
                  if (0xff < uVar18 >> 0x10) {
                    uVar10 = 0xff;
                  }
                  uVar18 = (_DAT_0069623c >> 8 & 0xff) *
                           ((int)(DAT_006961e6 * iVar16 + DAT_006961e8 * iVar15 +
                                  DAT_006961ea * iVar22 + DAT_006961d8 * 0x1000) >> 8);
                  uVar11 = (undefined1)(uVar18 >> 0x10);
                  if (0xff < uVar18 >> 0x10) {
                    uVar11 = 0xff;
                  }
                  uVar18 = (_DAT_0069623c >> 0x10 & 0xff) *
                           ((int)(DAT_006961ec * iVar16 + DAT_006961ee * iVar15 +
                                  DAT_006961f0 * iVar22 + DAT_006961dc * 0x1000) >> 8);
                  DAT_0069627c._0_2_ = CONCAT11(uVar11,uVar10);
                  uVar10 = (undefined1)(uVar18 >> 0x10);
                  if (0xff < uVar18 >> 0x10) {
                    uVar10 = 0xff;
                  }
                  DAT_0069627c._0_3_ = CONCAT12(uVar10,(undefined2)DAT_0069627c);
                  DAT_0069627c = CONCAT13(DAT_0069623f,(undefined3)DAT_0069627c);
                  *local_1ec = DAT_0069627c;
                  puVar25 = local_1c8;
                  if ((local_1c8 != (undefined4 *)0x0) && (local_1c8[1] != 0)) {
                    FUN_0049c5b0(&local_214,local_1b8,&local_208,local_1c0,local_20c,local_1c8);
                  }
                }
              }
              if (local_1e4 != local_1e8) {
                iVar16 = (uint)*(ushort *)(local_1e0 + -8) * 0xbc + iVar5;
                if (DAT_00791580 != 0) {
                  if ((local_1d0 == 2) || (local_1d0 == 3)) {
                    local_23c = (uint *)((uint)*(ushort *)(local_1e0 + -8) * 0x10 + iVar9);
                  }
                  if ((local_1d0 != 1) && (local_1d0 != 4)) {
                    if ((local_1b4 >> 0x10 & 4) == 0) {
                      if (local_1f4 != 0) {
                        *local_23c = puVar24[1 - local_1d8];
                        local_23c[1] = *puVar24;
                      }
                      if (local_1cc != 0) {
                        local_23c[2] = puVar24[-local_1d8];
                        local_23c[3] = puVar24[-1];
                      }
                    }
                    else {
                      if (local_1f4 != 0) {
                        *local_23c = puVar24[-local_1d8];
                        local_23c[1] = (puVar24 + -local_1d8)[1];
                      }
                      if (local_1cc != 0) {
                        local_23c[2] = puVar24[-1];
                        local_23c[3] = *puVar24;
                      }
                    }
                    goto LAB_00440e78;
                  }
                }
                if ((local_1b4 >> 0x10 & 4) == 0) {
                  if (local_1f4 != 0) {
                    *(uint *)(iVar16 + 4) = puVar24[1 - local_1d8];
                    *(uint *)(iVar16 + 0x24) = *puVar24;
                  }
                  if (local_1cc != 0) {
                    *(uint *)(iVar16 + 0x44) = puVar24[-local_1d8];
                    uVar18 = puVar24[-1];
                    goto LAB_00440e75;
                  }
                }
                else {
                  if (local_1f4 != 0) {
                    *(uint *)(iVar16 + 4) = puVar24[-local_1d8];
                    *(uint *)(iVar16 + 0x24) = (puVar24 + -local_1d8)[1];
                  }
                  if (local_1cc != 0) {
                    *(uint *)(iVar16 + 0x44) = puVar24[-1];
                    uVar18 = *puVar24;
LAB_00440e75:
                    *(uint *)(iVar16 + 100) = uVar18;
                  }
                }
              }
LAB_00440e78:
              puVar24 = puVar24 + 1;
              local_1e0 = local_1e0 + 8;
              local_1e4 = local_1e4 - 1;
              local_1bc = (int *)((int)local_1bc + (uint)*(ushort *)((int)local_64 + local_1e4 * 2))
              ;
              puVar26 = puVar25 + 5;
              local_1ec = puVar24;
              local_1c8 = puVar25 + 5;
              if (puVar25 == (undefined4 *)0x0) {
                puVar26 = puVar25;
                local_1c8 = puVar25;
              }
            }
            puVar17 = local_1ac;
            if (puVar24 < local_1ac + iVar19) {
              puVar17 = puVar24;
            }
            local_1bc = (int *)((int)local_1bc + local_1dc);
            local_1e4 = 0;
            local_220 = uVar20;
            local_1ec = puVar17;
            iVar16 = local_1d4;
            local_1d4 = local_1d8;
          }
          local_1d8 = iVar16;
          local_1e0 = local_1e0 + -8;
          local_230 = local_230 - 1;
        } while (0 < (int)local_230);
      }
      local_240 = local_240 + 1;
      puVar23 = puVar23 + 2;
    } while (local_240 < uVar4);
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

