import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import {
  Asset,
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import {
  keepLocalCopy,
  pick as pickDocuments,
  types as docTypes,
} from '@react-native-documents/picker';
import {
  Building2,
  CalendarRange,
  FileText,
  Paperclip,
  ChevronRight,
  TrendingUp,
  CircleCheck,
  Settings,
  Camera,
  ClipboardList,
  Images,
  KeyRound,
  LogOut,
  Menu,
  Minus,
  Package,
  Plus,
  Users,
  X,
} from 'lucide-react-native';
import { fetchMaterials, fetchSite, submitReport } from '../api/buildup';
import { currentPlace } from '../location';
import { errorMessage } from '../api/client';
import { useAuth, useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import MenuSheet from '../components/MenuSheet';
import ProgressRing from '../components/ProgressRing';
import {
  EMPTY_WORKLOG,
  WorkLogFields,
  isWorkLogEmpty,
  workLogSummary,
} from '../components/WorkLog';
import PhotoViewer from '../components/PhotoViewer';
import SubmitSheet from '../components/SubmitSheet';
import {
  AppHeader,
  BottomBar,
  Button,
  Card,
  IconButton,
} from '../components/ui';
import { MAX_PHOTOS } from '../data/dummy';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import {
  MaterialRequest,
  PickedFile,
  ProcessKey,
  Site,
  WorkLog,
} from '../types';
import { draftStore } from '../data/storage';
import { formatDate, formatTime, isToday, pct } from '../utils/format';
import {
  STATUS_META,
  overallPlannedAt,
  plannedAt,
  scheduleStatus,
  statusText,
} from '../utils/plan';

const STEP = 0.5;
const MAX_FILES = 5;
const MAX_FILE_MB = 20;
// 첨부할 수 있는 문서(서버 FileStorage.DOC_ALLOWED와 같음)
const DOC_EXT = [
  'pdf', 'xls', 'xlsx', 'csv', 'hwp', 'hwpx', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'zip',
];

// 1.2MB, 340KB
export const fileSize = (bytes: number | null | undefined) =>
  !bytes
    ? ''
    : bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
const ICON = { size: 20, color: colors.text, strokeWidth: 2 };

// 공정별 입력값을 마지막 보고 값으로 맞춘다
const baseValues = (site: Site) =>
  Object.fromEntries(site.processes.map(p => [p.key, p.progress])) as Record<
    ProcessKey,
    number
  >;

export default function ReportScreen({
  navigation,
  route,
}: ScreenProps<'Report'>) {
  const { siteId } = route.params;
  const { logout } = useAuth();
  const user = useUser();
  const dialog = useDialog();
  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<ProcessKey>('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [todayValues, setTodayValues] = useState<Record<ProcessKey, number>>();
  const [memo, setMemo] = useState('');
  const [memoFocused, setMemoFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [workLog, setWorkLog] = useState<WorkLog>(EMPTY_WORKLOG);
  const [viewing, setViewing] = useState<number | null>(null);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  // 임시저장: 처음 한 번 불러온 뒤부터 입력이 바뀔 때마다 저장
  const hydrated = useRef(false);
  // 직전에 받은 공정별 진행률(내가 올린 값과, 보고 삭제로 내려간 값을 구분하려고)
  const lastBase = useRef<Record<ProcessKey, number>>({});
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const s = await fetchSite(siteId);
      setSite(s);
      const prevBase = lastBase.current;
      lastBase.current = baseValues(s);
      // 고른 공정이 없어졌으면(또는 처음이면) 첫 번째 공정으로
      setSelected(prev =>
        s.processes.some(p => p.key === prev) ? prev : s.processes[0]?.key ?? '',
      );
      // 자재 요청 현황(실패해도 보고 작성에는 지장 없음)
      fetchMaterials(siteId)
        .then(setMaterials)
        .catch(() => {});
      if (!hydrated.current) {
        // 처음 들어올 때: 기준값 + 작성 중이던 임시저장 내용
        const base = baseValues(s);
        const draft = await draftStore.load(user.id, siteId);
        if (draft) {
          (Object.keys(draft.values) as ProcessKey[]).forEach(k => {
            const v = draft.values[k];
            if (v !== undefined && k in base) {
              base[k] = Math.min(100, Math.max(base[k], v));
            }
          });
          if (s.processes.some(p => p.key === draft.selected)) {
            setSelected(draft.selected);
          }
          setMemo(draft.memo);
          setPhotos(draft.photoUris.map(uri => ({ uri })));
          setFiles(draft.files ?? []);
          if (draft.workLog) {
            setWorkLog(draft.workLog);
          }
          setRestoredAt(draft.savedAt);
        }
        setTodayValues(base);
        hydrated.current = true;
      } else {
        // 다른 사람이 보고했거나 보고가 지워졌으면 입력값을 최신 진행률에 맞춘다
        setTodayValues(prev => {
          const next = baseValues(s);
          if (prev) {
            s.processes.forEach(p => {
              const v = prev[p.key];
              const old = prevBase[p.key] ?? p.progress;
              // 사용자가 직전 기준값보다 올려 둔 값만 유지(보고 삭제로 내려간 차이는 버림)
              if (v !== undefined && v > old && v > p.progress) {
                next[p.key] = Math.min(100, v);
              }
            });
          }
          return next;
        });
      }
    } catch {
      setLoadError(true);
    }
  }, [siteId, user.id]);

  // 입력이 바뀌면 0.5초 뒤 임시저장(바뀐 게 없으면 삭제)
  useEffect(() => {
    if (!hydrated.current || !site || !todayValues) {
      return;
    }
    const t = setTimeout(() => {
      const changed = site.processes.filter(
        p => todayValues[p.key] !== p.progress,
      );
      if (
        changed.length === 0 &&
        !memo.trim() &&
        photos.length === 0 &&
        files.length === 0 &&
        isWorkLogEmpty(workLog)
      ) {
        draftStore.clear(user.id, siteId);
        return;
      }
      draftStore.save(user.id, siteId, {
        selected,
        values: Object.fromEntries(
          changed.map(p => [p.key, todayValues[p.key]]),
        ),
        memo,
        photoUris: photos.map(p => p.uri!),
        files,
        workLog,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [
    site,
    todayValues,
    memo,
    photos,
    files,
    workLog,
    selected,
    user.id,
    siteId,
  ]);

  const discardDraft = async () => {
    const ok = await dialog.confirm({
      title: '새로 작성할까요?',
      message: '임시저장된 진행률, 사진, 첨부 파일, 작업 정보, 메모가 지워져요.',
      confirmText: '지우기',
      danger: true,
    });
    if (!ok) {
      return;
    }
    if (site) {
      setTodayValues(baseValues(site));
    }
    setMemo('');
    setPhotos([]);
    setFiles([]);
    setWorkLog(EMPTY_WORKLOG);
    setRestoredAt(null);
    draftStore.clear(user.id, siteId);
  };

  // 엑셀·PDF 등 문서 첨부(앱 안에 사본을 만들어 두어 임시저장 후에도 보낼 수 있게)
  const addFiles = async () => {
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      dialog.toast(`파일은 최대 ${MAX_FILES}개까지 첨부할 수 있어요`, 'error');
      return;
    }
    let picked;
    try {
      picked = await pickDocuments({
        type: [docTypes.allFiles],
        allowMultiSelection: true,
      });
    } catch {
      return; // 사용자가 닫음
    }
    const ok: PickedFile[] = [];
    const rejected: string[] = [];
    for (const f of picked) {
      const name = f.name ?? '파일';
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
      if (!DOC_EXT.includes(ext)) {
        rejected.push(`${name} (지원하지 않는 형식)`);
      } else if ((f.size ?? 0) > MAX_FILE_MB * 1024 * 1024) {
        rejected.push(`${name} (${MAX_FILE_MB}MB 초과)`);
      } else {
        ok.push({ uri: f.uri, name, type: f.type, size: f.size });
      }
    }
    const chosen = ok.slice(0, remaining);
    if (chosen.length > 0) {
      const copies = await keepLocalCopy({
        files: chosen.map(f => ({ uri: f.uri, fileName: f.name })) as [
          { uri: string; fileName: string },
          ...{ uri: string; fileName: string }[],
        ],
        destination: 'cachesDirectory',
      });
      const withLocal = chosen.map((f, i) => {
        const c = copies[i];
        return c && c.status === 'success' ? { ...f, uri: c.localUri } : f;
      });
      setFiles(prev => [...prev, ...withLocal]);
    }
    if (rejected.length > 0 || ok.length > chosen.length) {
      dialog.notice({
        icon: 'warning',
        title: '첨부하지 못한 파일이 있어요',
        message: [
          ...rejected,
          ...(ok.length > chosen.length
            ? [`최대 ${MAX_FILES}개까지라 ${ok.length - chosen.length}개는 빠졌어요`]
            : []),
        ].join('\n') + '\n\n엑셀·PDF·한글·워드·파워포인트 파일을 20MB까지 올릴 수 있어요.',
      });
    }
  };

  const removeFile = (uri: string) =>
    setFiles(prev => prev.filter(f => f.uri !== uri));

  // 다른 화면(코드 재발급 등)에서 돌아올 때마다 현장 정보 새로고침
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addPhotos = (res: ImagePickerResponse) => {
    if (res.didCancel) {
      return;
    }
    if (res.errorCode) {
      dialog.notice({
        icon: 'danger',
        title: '사진을 가져오지 못했어요',
        message: res.errorMessage ?? res.errorCode,
      });
      return;
    }
    const picked = (res.assets ?? []).filter(a => a.uri);
    setPhotos(prev => [...prev, ...picked].slice(0, MAX_PHOTOS));
  };

  const openPhotoMenu = async () => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      dialog.toast('사진은 최대 10장까지 올릴 수 있어요', 'error');
      return;
    }
    const options = {
      mediaType: 'photo' as const,
      quality: 0.7 as const,
      maxWidth: 1600,
      maxHeight: 1600,
      includeExtra: true, // 원본 사진의 촬영 시각(timestamp)을 함께 받는다
    };
    const pick = await dialog.choose({
      title: '현장 사진 추가',
      message: `${remaining}장 더 추가할 수 있어요`,
      options: [
        {
          label: '카메라로 촬영',
          description: '지금 현장을 바로 찍어요',
          icon: <Camera {...ICON} />,
          value: 'camera' as const,
        },
        {
          label: '앨범에서 선택',
          description: `최대 ${remaining}장까지 한 번에 고를 수 있어요`,
          icon: <Images {...ICON} />,
          value: 'library' as const,
        },
      ],
    });
    if (pick === 'camera') {
      // 카메라로 찍은 사진은 지금이 촬영 시각
      launchCamera({ ...options, saveToPhotos: false }).then(res =>
        addPhotos({
          ...res,
          assets: res.assets?.map(a => ({
            ...a,
            timestamp: a.timestamp ?? new Date().toISOString(),
          })),
        }),
      );
    } else if (pick === 'library') {
      launchImageLibrary({ ...options, selectionLimit: remaining }).then(
        addPhotos,
      );
    }
  };

  const removePhoto = async (uri?: string) => {
    const ok = await dialog.confirm({
      title: '사진을 뺄까요?',
      message: '이 보고에서만 빠지고, 폰 앨범의 사진은 그대로 있어요.',
      confirmText: '빼기',
      danger: true,
    });
    if (ok) {
      setPhotos(prev => prev.filter(p => p.uri !== uri));
    }
  };

  if (!site || !todayValues) {
    return (
      <View style={styles.root}>
        <AppHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.loadError}>
                현장 정보를 불러오지 못했어요.
              </Text>
              <Button title="다시 시도" onPress={load} style={styles.retry} />
            </>
          ) : (
            <ActivityIndicator color={colors.navy} size="large" />
          )}
        </View>
      </View>
    );
  }

  // 공정이 아직 없는 현장: 총관리자에게 공정 만들기 안내
  if (site.processes.length === 0) {
    const owner = site.ownerId === user.id;
    return (
      <View style={styles.root}>
        <AppHeader
          title={site.name}
          subtitle={formatDate()}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.center}>
          <View style={styles.noProcIcon}>
            <CalendarRange size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.noProcTitle}>아직 공정이 없어요</Text>
          <Text style={styles.noProcDesc}>
            {owner
              ? '현장에 맞게 공정을 먼저 만들어 주세요.\n공정을 만들면 작업자들이 보고할 수 있어요.'
              : '현장 총관리자가 공정을 만들면\n보고할 수 있어요.'}
          </Text>
          {owner ? (
            <Button
              title="공정 만들기"
              onPress={() => navigation.navigate('Plan', { siteId: site.id })}
              style={styles.retry}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const process =
    site.processes.find(p => p.key === selected) ?? site.processes[0];
  const base = process.progress; // 마지막 보고 값
  const baseLabel = !process.lastReportedAt
    ? '시작'
    : isToday(process.lastReportedAt)
    ? '직전 보고'
    : `${new Date(process.lastReportedAt).getMonth() + 1}/${new Date(
        process.lastReportedAt,
      ).getDate()} 보고`;
  const today = todayValues[process.key] ?? process.progress;
  const added = today - base;

  const change = (delta: number) => {
    // 마지막 보고 값 아래로, 100% 위로는 못 가게 제한
    const next = Math.min(100, Math.max(base, today + delta));
    setTodayValues(
      v => v && { ...v, [process.key]: Math.round(next * 10) / 10 },
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    // 입력칸을 비우기 전에 완료 안내에 쓸 값 기억
    const submittedPhotos = photos.length;
    const submittedFiles = files.length;
    const submittedMemo = !!memo.trim();
    const submittedLog = workLogSummary(workLog);
    try {
      // 제출 위치(휴대폰 GPS). 위치 권한을 안 주면 위치 없이 제출
      const place = await currentPlace();
      await submitReport({
        siteId: site.id,
        processKey: process.key,
        to: today,
        photoUris: photos.map(p => p.uri!),
        photoTakenAt: photos.map(p => p.timestamp ?? null),
        location: place,
        files,
        memo: memo.trim(),
        workLog: { ...workLog, equipment: workLog.equipment.trim() },
      });
      // 제출 성공: 화면의 기준값을 바로 제출한 값으로(새로고침이 실패해도 중복 제출 안 되게)
      const now = new Date().toISOString();
      const local = {
        ...site,
        processes: site.processes.map(p =>
          p.key === process.key
            ? { ...p, progress: today, lastReportedAt: now }
            : p,
        ),
      };
      setSite(local);
      setTodayValues(baseValues(local));
      lastBase.current = baseValues(local);
      fetchSite(site.id)
        .then(updated => {
          setSite(updated);
          setTodayValues(baseValues(updated));
          lastBase.current = baseValues(updated);
        })
        .catch(() => {});
      setPhotos([]);
      setFiles([]);
      setMemo('');
      setWorkLog(EMPTY_WORKLOG);
      setRestoredAt(null);
      draftStore.clear(user.id, site.id);
      setSheetOpen(false);
      const next = await dialog.show({
        icon: 'success',
        title: '보고를 제출했어요',
        message:
          `${process.name} ${pct(base)} → ${pct(today)} (+${added.toFixed(
            1,
          )}%p)\n` +
          `사진 ${submittedPhotos}장` +
          (submittedFiles ? ` · 파일 ${submittedFiles}개` : '') +
          (submittedMemo ? ' · 메모 포함' : '') +
          (submittedLog ? `\n${submittedLog}` : ''),
        actions: [
          { label: '이력 보기', value: 'history', variant: 'secondary' },
          { label: '확인', value: 'ok', variant: 'primary' },
        ],
      });
      if (next === 'history') {
        navigation.navigate('History', {
          siteId: site.id,
          siteName: site.name,
        });
      }
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '제출하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reportedToday = site.processes.filter(p =>
    isToday(p.lastReportedAt),
  ).length;
  const isOwner = site.ownerId === user.id;
  const overallPlanned = overallPlannedAt(site.processes);
  const overallStatus =
    overallPlanned !== null
      ? scheduleStatus(site.overallProgress, overallPlanned)
      : null;
  const goProgress = () =>
    navigation.navigate('Progress', { siteId: site.id, siteName: site.name });
  const goMaterials = () =>
    navigation.navigate('Materials', { siteId: site.id, siteName: site.name });
  const newMaterialRequest = () =>
    navigation.navigate('MaterialRequest', {
      siteId: site.id,
      siteName: site.name,
      processKey: selected,
    });
  // 총관리자: 내가 승인·반려할 요청 / 작업자: 내 요청 중 승인 대기
  const waitingMaterials = materials.filter(m => m.canApprove).length;
  const myOpenMaterials = materials.filter(
    m => m.authorId === user.id && m.status === 'requested',
  ).length;
  const materialStatusText = isOwner
    ? waitingMaterials > 0
      ? `처리할 요청 ${waitingMaterials}건`
      : site.hqName
      ? `${site.hqName}에 연결됨`
      : '처리할 요청이 없어요'
    : myOpenMaterials > 0
    ? `내 요청 승인 대기 ${myOpenMaterials}건`
    : '부족한 자재를 관리자에게 바로 요청해요';
  const canMinus = today > base;
  const canPlus = today < 100;

  return (
    <View style={styles.root}>
      <AppHeader
        title={site.name}
        subtitle={`${formatDate()} · ${
          site.ownerId === user.id ? '관리자' : '작업자로 참여'
        }`}
        onBack={() => navigation.goBack()}
        right={
          <IconButton label="메뉴" onPress={() => setMenuOpen(true)}>
            <Menu size={22} color={colors.text} strokeWidth={2} />
          </IconButton>
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {restoredAt ? (
            <View style={styles.restored}>
              <Text style={styles.restoredText}>
                {formatTime(restoredAt)}에 작성 중이던 내용을 불러왔어요
              </Text>
              <Pressable hitSlop={8} onPress={discardDraft}>
                <Text style={styles.restoredLink}>새로 쓰기</Text>
              </Pressable>
            </View>
          ) : null}

          {/* 전체 진행률 */}
          <Card style={styles.hero}>
            <View style={styles.ringRow}>
              <ProgressRing
                value={site.overallProgress}
                planned={overallPlanned}
              />
              <View style={styles.ringSide}>
                <Text style={styles.label}>전체 진행률</Text>
                <Text style={styles.todayCount}>
                  오늘 보고 {reportedToday}/{site.processes.length}
                </Text>
                {overallStatus ? (
                  <View style={styles.ringStatus}>
                    <View
                      style={[
                        styles.statusChip,
                        { backgroundColor: STATUS_META[overallStatus.status].bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: STATUS_META[overallStatus.status].color },
                        ]}
                      >
                        {statusText(overallStatus.diff, overallStatus.status)}
                      </Text>
                    </View>
                    <Text style={styles.planText}>
                      계획 {overallPlanned?.toFixed(1)}%
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.planText, styles.ringHint]}>
                    {isOwner
                      ? '공정 계획을 정하면 지연 여부를 알려드려요'
                      : '아직 공정 계획이 없어요'}
                  </Text>
                )}
                <Pressable
                  style={styles.ringLink}
                  onPress={goProgress}
                  hitSlop={6}
                >
                  <Text style={styles.planLinkText}>진척 현황</Text>
                  <ChevronRight size={16} color={colors.white} />
                </Pressable>
              </View>
            </View>

            {/* 공정별 현황(누르면 해당 공정 선택) */}
            <View style={styles.overview}>
              {site.processes.map(p => {
                const active = p.key === selected;
                const planned = plannedAt(p);
                const behind =
                  planned !== null &&
                  scheduleStatus(p.progress, planned).status === 'behind';
                return (
                  <Pressable
                    key={p.key}
                    style={styles.ovRow}
                    onPress={() => setSelected(p.key)}
                    hitSlop={4}
                  >
                    <View style={styles.ovNameBox}>
                      <Text
                        style={[styles.ovName, active && styles.ovNameActive]}
                      >
                        {p.name}
                      </Text>
                      {isToday(p.lastReportedAt) ? (
                        <CircleCheck size={13} color={colors.success} />
                      ) : null}
                    </View>
                    <View style={styles.ovTrackWrap}>
                      <View style={styles.ovTrack}>
                        <View
                          style={[
                            styles.ovFill,
                            active && styles.ovFillActive,
                            { width: `${p.progress}%` },
                          ]}
                        />
                      </View>
                      {planned !== null ? (
                        <View
                          style={[styles.ovTick, { left: `${planned}%` }]}
                        />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.ovValue,
                        active && styles.ovNameActive,
                        behind && styles.ovBehind,
                      ]}
                    >
                      {p.progress.toFixed(1)}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* 공정 선택 + 진행률 */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>공정</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.procChips}
            >
              {site.processes.map(p => {
                const active = p.key === process.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.procChip, active && styles.procChipActive]}
                    onPress={() => setSelected(p.key)}
                  >
                    <Text
                      style={[
                        styles.procChipText,
                        active && styles.procChipTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.progressTop}>
              <View>
                <Text style={styles.progressValue}>{today.toFixed(1)}%</Text>
                <Text style={styles.progressSub}>
                  {baseLabel} {base.toFixed(1)}%
                  {added > 0 ? (
                    <Text style={styles.addedText}>
                      {'  '}+{added.toFixed(1)}%p
                    </Text>
                  ) : null}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityLabel="0.5%p 내리기"
                  style={[styles.stepBtn, !canMinus && styles.disabled]}
                  onPress={() => change(-STEP)}
                  disabled={!canMinus}
                >
                  <Minus {...ICON} />
                </Pressable>
                <Pressable
                  accessibilityLabel="0.5%p 올리기"
                  style={[styles.stepBtn, !canPlus && styles.disabled]}
                  onPress={() => change(STEP)}
                  disabled={!canPlus}
                >
                  <Plus {...ICON} />
                </Pressable>
              </View>
            </View>

            <View style={styles.track}>
              <View style={[styles.fillBase, { width: `${base}%` }]} />
              <View style={[styles.fillToday, { width: `${added}%` }]} />
            </View>
            <View style={styles.legend}>
              <View style={[styles.dot, styles.dotBase]} />
              <Text style={styles.legendText}>누적</Text>
              <View style={[styles.dot, styles.dotToday]} />
              <Text style={styles.legendText}>오늘 작업분</Text>
              <Text style={styles.legendStep}>버튼 1회 {STEP}%p</Text>
            </View>
          </Card>

          {/* 현장 사진 */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>현장 사진</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              <Pressable
                accessibilityLabel="사진 추가"
                style={({ pressed }) => [
                  styles.addPhoto,
                  pressed && styles.addPhotoPressed,
                  photos.length >= MAX_PHOTOS && styles.disabled,
                ]}
                onPress={openPhotoMenu}
              >
                <Camera size={24} color={colors.textSub} strokeWidth={1.8} />
                <Text style={styles.addPhotoCount}>
                  <Text style={photos.length > 0 ? styles.countOn : undefined}>
                    {photos.length}
                  </Text>
                  /{MAX_PHOTOS}
                </Text>
              </Pressable>
              {photos.map((p, i) => (
                <Pressable
                  key={p.uri}
                  style={styles.thumb}
                  onPress={() => setViewing(i)}
                  accessibilityLabel={`사진 ${i + 1} 크게 보기`}
                >
                  <Image source={{ uri: p.uri }} style={styles.thumbImage} />
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() => removePhoto(p.uri)}
                    hitSlop={8}
                    accessibilityLabel={`사진 ${i + 1} 삭제`}
                  >
                    <X size={12} color={colors.white} strokeWidth={3} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
            {photos.length === 0 ? (
              <Text style={styles.hint}>
                오늘 작업한 모습을 사진으로 남겨 주세요.
              </Text>
            ) : null}
          </Card>

          {/* 첨부 파일(엑셀·PDF 등) */}
          <Card style={styles.gap}>
            <View style={styles.fileTitleRow}>
              <Text style={styles.cardTitleInline}>첨부 파일</Text>
              <Text style={styles.fileCount}>
                {files.length}/{MAX_FILES}
              </Text>
            </View>
            {files.map(f => (
              <View key={f.uri} style={styles.fileRow}>
                <FileText size={20} color={colors.textSub} />
                <View style={styles.flex}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.size ? (
                    <Text style={styles.fileMeta}>{fileSize(f.size)}</Text>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => removeFile(f.uri)}
                  accessibilityLabel={`${f.name} 빼기`}
                >
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [
                styles.fileAdd,
                pressed && styles.addPhotoPressed,
                files.length >= MAX_FILES && styles.disabled,
              ]}
              onPress={addFiles}
            >
              <Paperclip size={18} color={colors.text} />
              <Text style={styles.fileAddText}>파일 첨부</Text>
            </Pressable>
            <Text style={styles.hint}>
              엑셀·PDF·한글·워드·파워포인트 파일, 한 개당 20MB까지
            </Text>
          </Card>

          {/* 작업 정보(작업일보) */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>작업 정보</Text>
            <WorkLogFields value={workLog} onChange={setWorkLog} />
          </Card>

          {/* 작업 메모 */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>작업 메모</Text>
            <TextInput
              style={[styles.memo, memoFocused && styles.memoFocused]}
              value={memo}
              onChangeText={setMemo}
              onFocus={() => setMemoFocused(true)}
              onBlur={() => setMemoFocused(false)}
              placeholder="오늘 작업 내용, 특이사항을 입력하세요"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </Card>

          {/* 자재 요청 */}
          <Card style={styles.gap}>
            <Pressable
              style={styles.materialRow}
              onPress={goMaterials}
              hitSlop={4}
            >
              <View style={styles.materialIcon}>
                <Package size={20} color={colors.text} strokeWidth={2} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.materialTitle}>자재 요청</Text>
                <Text
                  style={[
                    styles.materialSub,
                    isOwner && waitingMaterials > 0 && styles.materialSubOn,
                  ]}
                >
                  {materialStatusText}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
            <Button
              title="자재 요청하기"
              variant="outline"
              onPress={newMaterialRequest}
              style={styles.materialBtn}
            />
          </Card>
        </ScrollView>

        <BottomBar>
          <Button title="보고 제출" onPress={() => setSheetOpen(true)} />
        </BottomBar>
      </KeyboardAvoidingView>

      <SubmitSheet
        visible={sheetOpen}
        siteName={site.name}
        processName={process.name}
        from={base}
        to={today}
        photoCount={photos.length}
        fileCount={files.length}
        workLog={workLogSummary(workLog)}
        memo={memo}
        submitting={submitting}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleSubmit}
      />

      <PhotoViewer
        uris={photos.map(p => p.uri!)}
        index={viewing}
        onClose={() => setViewing(null)}
      />

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            icon: <TrendingUp {...ICON} />,
            label: '진척 현황',
            onPress: goProgress,
          },
          {
            icon: <ClipboardList {...ICON} />,
            label: '보고 이력',
            onPress: () =>
              navigation.navigate('History', {
                siteId: site.id,
                siteName: site.name,
              }),
          },
          {
            icon: <Package {...ICON} />,
            label: '자재 요청',
            description:
              waitingMaterials > 0 ? `처리 ${waitingMaterials}건` : undefined,
            onPress: goMaterials,
          },
          {
            icon: <Users {...ICON} />,
            label: '참여자',
            description: `${site.memberCount}명`,
            onPress: () =>
              navigation.navigate('Members', {
                siteId: site.id,
                siteName: site.name,
                isOwner: site.ownerId === user.id,
              }),
          },
          // 참여 코드는 이 현장의 총관리자에게만 내려온다
          ...(site.code
            ? [
                {
                  icon: <KeyRound {...ICON} />,
                  label: '참여 코드',
                  description: site.code,
                  onPress: () =>
                    navigation.navigate('SiteCode', {
                      siteId: site.id,
                      siteName: site.name,
                      code: site.code!,
                    }),
                },
                {
                  icon: <CalendarRange {...ICON} />,
                  label: '공정 관리',
                  onPress: () =>
                    navigation.navigate('Plan', { siteId: site.id }),
                },
                {
                  icon: <Settings {...ICON} />,
                  label: '현장 설정',
                  onPress: () =>
                    navigation.navigate('SiteSettings', { siteId: site.id }),
                },
              ]
            : []),
          {
            icon: <Building2 {...ICON} />,
            label: '현장 목록',
            onPress: () => navigation.popTo('Sites'),
          },
          {
            icon: <LogOut {...ICON} color={colors.danger} />,
            label: '로그아웃',
            danger: true,
            onPress: async () => {
              const ok = await dialog.confirm({
                title: '로그아웃할까요?',
                message: '다시 로그인하면 참여한 현장을 그대로 볼 수 있어요.',
                confirmText: '로그아웃',
              });
              if (ok) {
                logout();
              }
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadError: { fontSize: 15, color: colors.text, marginBottom: 12 },
  retry: { paddingHorizontal: 28 },

  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  gap: { marginTop: 12 },
  label: { fontSize: 14, color: '#A9B0C0' },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 10 },

  // 임시저장 안내
  restored: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.yellowSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  restoredText: { flex: 1, fontSize: 13, color: '#8A5E00' },
  restoredLink: { fontSize: 13, fontWeight: '700', color: '#8A5E00' },
  todayCount: { color: colors.white, fontWeight: '600' },
  ovNameBox: {
    width: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // 전체 진행률(남색 카드)
  hero: { backgroundColor: colors.navy },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringSide: { flex: 1, gap: 6 },
  ringStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ringHint: { marginTop: 2 },
  ringLink: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  overallValue: { fontSize: 30, fontWeight: '800', color: colors.white },
  overallUnit: { fontSize: 18, fontWeight: '700', color: '#A9B0C0' },
  thinTrackWrap: { marginTop: 12 },
  planTick: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 14,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  statusChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  planText: { flexShrink: 1, fontSize: 13, color: '#A9B0C0' },
  planLink: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  planLinkText: { fontSize: 13, fontWeight: '600', color: colors.white },
  ovTrackWrap: { flex: 1, justifyContent: 'center' },
  ovTick: {
    position: 'absolute',
    width: 2,
    height: 10,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
  ovBehind: { color: '#FF8A8A' },
  thinTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  thinFill: { height: '100%', borderRadius: 4, backgroundColor: colors.yellow },
  overview: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 10,
  },
  ovRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ovName: { fontSize: 13, color: '#A9B0C0' },
  ovNameActive: { color: colors.white, fontWeight: '700' },
  ovTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  ovFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.45)' },
  ovFillActive: { backgroundColor: colors.yellow },
  ovValue: {
    width: 48,
    textAlign: 'right',
    fontSize: 13,
    color: '#A9B0C0',
    fontVariant: ['tabular-nums'],
  },

  // 공정 고르기(가로로 넘김)
  procChips: { gap: 8, paddingRight: 4 },
  procChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  procChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  procChipText: { fontSize: 15, fontWeight: '500', color: colors.textSub },
  procChipTextActive: { fontWeight: '700', color: colors.white },

  // 공정이 없는 현장
  noProcIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  noProcTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  noProcDesc: {
    fontSize: 14,
    color: colors.textSub,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },

  // 첨부 파일
  fileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitleInline: { fontSize: 16, fontWeight: '700', color: colors.text },
  fileCount: { fontSize: 13, color: colors.textMuted },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  fileAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  fileAddText: { fontSize: 15, fontWeight: '600', color: colors.text },

  // 세그먼트(예전 공정 선택 모양)
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.white,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: { fontSize: 15, fontWeight: '500', color: colors.textSub },
  segmentTextActive: { fontWeight: '700', color: colors.text },

  // 공정 진행률
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  progressValue: { fontSize: 30, fontWeight: '800', color: colors.text },
  progressSub: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  addedText: { fontWeight: '700', color: '#B7800A' },
  stepper: { flexDirection: 'row', gap: 8 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 16,
  },
  fillBase: { height: '100%', backgroundColor: colors.navy },
  fillToday: { height: '100%', backgroundColor: colors.yellow },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  dotBase: { backgroundColor: colors.navy },
  dotToday: { backgroundColor: colors.yellow, marginLeft: 12 },
  legendText: { fontSize: 12, color: colors.textSub },
  legendStep: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },

  // 사진
  photoRow: { gap: 8 },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoPressed: { backgroundColor: colors.fill },
  addPhotoCount: { fontSize: 12, color: colors.textMuted },
  countOn: { color: colors.text, fontWeight: '600' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.track,
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(18,23,34,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 메모
  memo: {
    minHeight: 110,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.fill,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  memoFocused: { backgroundColor: colors.white, borderColor: colors.navy },

  // 자재 요청
  materialRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  materialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  materialSub: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  materialSubOn: { color: '#B7800A', fontWeight: '600' },
  materialBtn: { marginTop: 16, height: 48 },
});
