import defaultState from './AddState';

import _push from '../push';
import { updateSchemaInfo, makeMigrationCall } from '../DataActions';
import {
  showSuccessNotification,
  showErrorNotification,
} from '../../Common/Notification';
import { UPDATE_MIGRATION_STATUS_ERROR } from '../../../Main/Actions';
import { setTable } from '../DataActions.js';

const SET_DEFAULTS = 'AddTable/SET_DEFAULTS';
const SET_TABLENAME = 'AddTable/SET_TABLENAME';
const SET_TABLECOMMENT = 'AddTable/SET_TABLECOMMENT';
const REMOVE_COLUMN = 'AddTable/REMOVE_COLUMN';
const SET_COLNAME = 'AddTable/SET_COLNAME';
const SET_COLTYPE = 'AddTable/SET_COLTYPE';
const SET_COLDEFAULT = 'AddTable/SET_COLDEFAULT';
const REMOVE_COLDEFAULT = 'AddTable/REMOVE_COLDEFAULT';
const SET_COLNULLABLE = 'AddTable/SET_COLNULLABLE';
const SET_COLUNIQUE = 'AddTable/SET_COLUNIQUE';
const ADD_COL = 'AddTable/ADD_COL';
const SET_PK = 'AddTable/SET_PK';
const SET_FKS = 'AddTable/SET_FKS';
const SET_UNIQUE_KEYS = 'AddTable/SET_UNIQUE_KEYS';
const TOGGLE_FK = 'AddTable/TOGGLE_FK';
const CLEAR_FK_TOGGLE = 'AddTable/CLEAR_FK_TOGGLE';
const MAKING_REQUEST = 'AddTable/MAKING_REQUEST';
const REQUEST_SUCCESS = 'AddTable/REQUEST_SUCCESS';
const REQUEST_ERROR = 'AddTable/REQUEST_ERROR';
const VALIDATION_ERROR = 'AddTable/VALIDATION_ERROR';
const RESET_VALIDATION_ERROR = 'AddTable/RESET_VALIDATION_ERROR';

/*
 * For any action dispatched, the ability to notify the renderer that something is happening
 * */

const setDefaults = () => ({ type: SET_DEFAULTS });
const setTableName = value => ({ type: SET_TABLENAME, value });
const setTableComment = value => ({ type: SET_TABLECOMMENT, value });
const removeColumn = i => ({ type: REMOVE_COLUMN, index: i });
const setColName = (name, index, isNull) => ({
  type: SET_COLNAME,
  name,
  index,
  isNull,
});
const setColDefault = (colDefault, index, isNull) => ({
  type: SET_COLDEFAULT,
  colDefault,
  index,
  isNull,
});
const setColType = (coltype, index) => ({
  type: SET_COLTYPE,
  coltype,
  index,
});
const removeColDefault = index => ({ type: REMOVE_COLDEFAULT, index });
const setColNullable = (isNull, index) => ({
  type: SET_COLNULLABLE,
  isNull,
  index,
});
const setColUnique = (isUnique, index) => ({
  type: SET_COLUNIQUE,
  isUnique,
  index,
});

const setUniqueKeys = keys => ({
  type: SET_UNIQUE_KEYS,
  data: keys,
});

const addCol = () => ({ type: ADD_COL });
const setPk = pks => ({ type: SET_PK, pks });
const setForeignKeys = fks => ({
  type: SET_FKS,
  fks,
});
const toggleFk = i => ({ type: TOGGLE_FK, data: i });
const clearFkToggle = () => ({ type: CLEAR_FK_TOGGLE });

// General error during validation.
// const validationError = (error) => ({type: VALIDATION_ERROR, error: error});
const validationError = error => {
  alert(error);
  return { type: VALIDATION_ERROR, error };
};
const resetValidation = () => ({ type: RESET_VALIDATION_ERROR });

const createTableSql = () => {
  return (dispatch, getState) => {
    dispatch({ type: MAKING_REQUEST });
    dispatch(showSuccessNotification('Creating Table...'));
    const state = getState().addTable.table;
    const currentSchema = getState().tables.currentSchema;
    const { foreignKeys, uniqueKeys } = state;
    // validations
    if (state.tableName.trim() === '') {
      alert('Table name cannot be empty');
    }
    let tableColumns = '';
    const currentCols = state.columns.filter(c => c.name !== '');
    const pKeys = state.primaryKeys
      .filter(p => p !== '')
      .map(p => state.columns[p].name);
    let isUUIDDefault = false;
    for (let i = 0; i < currentCols.length; i++) {
      tableColumns +=
        '"' + currentCols[i].name + '"' + ' ' + currentCols[i].type + ' ';
      // check if column is nullable
      if (!currentCols[i].nullable) {
        tableColumns += 'NOT NULL';
      }
      // check if column has a default value
      if (
        currentCols[i].default !== undefined &&
        currentCols[i].default.value !== ''
      ) {
        if (currentCols[i].type === 'text') {
          // if a column type is text and if it has a default value, add a single quote by default
          tableColumns += " DEFAULT '" + currentCols[i].default.value + "'";
        } else {
          if (currentCols[i].type === 'uuid') {
            isUUIDDefault = true;
          }
          tableColumns += ' DEFAULT ' + currentCols[i].default.value;
        }
      }
      tableColumns += i === currentCols.length - 1 ? '' : ', ';
    }
    // add primary key
    if (pKeys.length > 0) {
      tableColumns += ', PRIMARY KEY (';
      pKeys.map(col => {
        tableColumns += '"' + col + '"' + ',';
      });
      tableColumns = tableColumns.slice(0, -1);
      tableColumns += ') ';
    }
    const numFks = foreignKeys.length;
    let errorColumn = null;
    if (numFks > 1) {
      foreignKeys.forEach((fk, _i) => {
        if (_i === numFks - 1) {
          return;
        }
        const mappingObj = {};
        const { colMappings, refTableName, onUpdate, onDelete } = fk;
        const rCols = [];
        const lCols = [];
        colMappings.slice(0, -1).forEach(cm => {
          if (mappingObj[cm.column] !== undefined) {
            errorColumn = state.columns[cm.column].name;
          }
          mappingObj[cm.column] = cm.refColumn;
          lCols.push(`"${state.columns[cm.column].name}"`);
          rCols.push(`"${cm.refColumn}"`);
        });
        if (lCols.length === 0) return;
        tableColumns = `${tableColumns}, FOREIGN KEY (${lCols.join(
          ', '
        )}) REFERENCES "${fk.refSchemaName}"."${refTableName}"(${rCols.join(
          ', '
        )}) ON UPDATE ${onUpdate} ON DELETE ${onDelete}`;
      });
    }
    if (errorColumn) {
      return dispatch(
        showErrorNotification(
          'Create table failed',
          `The column "${errorColumn}" seems to be referencing multiple foreign columns`
        )
      );
    }

    const numUniqueConstraints = uniqueKeys.length;
    if (numUniqueConstraints > 0) {
      uniqueKeys.forEach(uk => {
        if (!uk.length) {
          return;
        }
        const uniqueColumns = uk.map(c => `"${state.columns[c].name}"`);
        tableColumns = `${tableColumns}, UNIQUE (${uniqueColumns.join(', ')})`;
      });
    }

    // const sqlCreateTable = 'CREATE TABLE ' + '\'' + state.tableName.trim() + '\'' + '(' + tableColumns + ')';
    const sqlCreateExtension = 'CREATE EXTENSION IF NOT EXISTS pgcrypto;';
    let sqlCreateTable =
      'CREATE TABLE ' +
      '"' +
      currentSchema +
      '"' +
      '.' +
      '"' +
      state.tableName.trim() +
      '"' +
      '(' +
      tableColumns +
      ');';
    // add comment if applicable
    if (state.tableComment && state.tableComment !== '') {
      sqlCreateTable +=
        ' COMMENT ON TABLE ' +
        '"' +
        currentSchema +
        '"' +
        '.' +
        '"' +
        state.tableName.trim() +
        '"' +
        ' IS ' +
        "'" +
        state.tableComment +
        "'";
    }
    // apply migrations
    const migrationName =
      'create_table_' + currentSchema + '_' + state.tableName.trim();
    const upQueryArgs = [];
    if (isUUIDDefault) {
      upQueryArgs.push({
        type: 'run_sql',
        args: { sql: sqlCreateExtension },
      });
    }
    upQueryArgs.push({
      type: 'run_sql',
      args: { sql: sqlCreateTable },
    });
    upQueryArgs.push({
      type: 'add_existing_table_or_view',
      args: {
        name: state.tableName.trim(),
        schema: currentSchema,
      },
    });
    const upQuery = {
      type: 'bulk',
      args: upQueryArgs,
    };
    const sqlDropTable =
      'DROP TABLE ' +
      '"' +
      currentSchema +
      '"' +
      '.' +
      '"' +
      state.tableName.trim() +
      '"';
    const downQuery = {
      type: 'bulk',
      args: [
        {
          type: 'run_sql',
          args: { sql: sqlDropTable },
        },
      ],
    };
    const requestMsg = 'Creating table...';
    const successMsg = 'Table Created';
    const errorMsg = 'Create table failed';

    const customOnSuccess = () => {
      dispatch({ type: REQUEST_SUCCESS });
      dispatch({ type: SET_DEFAULTS });
      dispatch(setTable(state.tableName.trim()));
      dispatch(updateSchemaInfo()).then(() =>
        dispatch(
          _push(
            '/schema/' +
              currentSchema +
              '/tables/' +
              state.tableName.trim() +
              '/modify'
          )
        )
      );
      return;
    };
    const customOnError = err => {
      dispatch({ type: REQUEST_ERROR, data: errorMsg });
      dispatch({ type: UPDATE_MIGRATION_STATUS_ERROR, data: err });
      return;
    };

    makeMigrationCall(
      dispatch,
      getState,
      upQuery.args,
      downQuery.args,
      migrationName,
      customOnSuccess,
      customOnError,
      requestMsg,
      successMsg,
      errorMsg,
      true
    );
  };
};

const addTableReducer = (state = defaultState, action) => {
  switch (action.type) {
    case SET_DEFAULTS:
      return { ...defaultState };
    case MAKING_REQUEST:
      return {
        ...state,
        ongoingRequest: true,
        lastError: null,
        lastSuccess: null,
      };
    case REQUEST_SUCCESS:
      return {
        ...state,
        ongoingRequest: false,
        lastError: null,
        lastSuccess: true,
      };
    case REQUEST_ERROR:
      return {
        ...state,
        ongoingRequest: false,
        lastError: action.data,
        lastSuccess: null,
      };
    case RESET_VALIDATION_ERROR:
      return { ...state, internalError: null, lastSuccess: null };
    case VALIDATION_ERROR:
      return { ...state, internalError: action.error, lastSuccess: null };
    case SET_TABLENAME:
      return { ...state, tableName: action.value };
    case SET_TABLECOMMENT:
      return { ...state, tableComment: action.value };
    case REMOVE_COLUMN:
      // Removes the index of the removed column from the array of primaryKeys.
      const primaryKeys = state.primaryKeys
        .map(primaryKeyIndex => {
          const pkiValue = parseInt(primaryKeyIndex, 10);
          if (pkiValue < action.index) {
            return primaryKeyIndex;
          }
          if (pkiValue > action.index) {
            return (pkiValue - 1).toString();
          }
        })
        .filter(pki => Boolean(pki));

      const uniqueKeys = state.uniqueKeys.map(uk => {
        const newUniqueKey = uk.map(c => {
          if (c > action.index) return c - 1;
          if (c < action.index) return c;
        });
        return [...newUniqueKey];
      });

      return {
        ...state,
        columns: [
          ...state.columns.slice(0, action.index),
          ...state.columns.slice(action.index + 1),
        ],
        primaryKeys: [...primaryKeys, ''],
        uniqueKeys: [...uniqueKeys],
      };
    case SET_COLNAME:
      const i = action.index;
      return {
        ...state,
        columns: [
          ...state.columns.slice(0, i),
          { ...state.columns[i], name: action.name, nullable: action.isNull },
          ...state.columns.slice(i + 1),
        ],
      };
    case SET_COLTYPE:
      const ij = action.index;
      return {
        ...state,
        columns: [
          ...state.columns.slice(0, ij),
          {
            ...state.columns[ij],
            type: action.coltype,
          },
          ...state.columns.slice(ij + 1),
        ],
      };
    case SET_COLDEFAULT:
      const ik = action.index;
      let defaultObj = {};
      defaultObj = { __type: 'value', value: action.colDefault };
      return {
        ...state,
        columns: [
          ...state.columns.slice(0, ik),
          {
            ...state.columns[ik],
            default: defaultObj,
            nullable: action.isNull,
          },
          ...state.columns.slice(ik + 1),
        ],
      };
    case REMOVE_COLDEFAULT:
      const ind = action.index;
      const dumyState = { ...state };
      delete dumyState.columns[ind].default;
      return dumyState;
    case SET_COLNULLABLE:
      const k = action.index;
      return {
        ...state,
        columns: [
          ...state.columns.slice(0, k),
          { ...state.columns[k], nullable: action.isNull },
          ...state.columns.slice(k + 1),
        ],
      };
    case SET_COLUNIQUE:
      const colInd = action.index;
      return {
        ...state,
        columns: [
          ...state.columns.slice(0, colInd),
          { ...state.columns[colInd], unique: action.isUnique },
          ...state.columns.slice(colInd + 1),
        ],
      };
    case ADD_COL:
      return { ...state, columns: [...state.columns, { name: '', type: '' }] };
    case SET_PK:
      return {
        ...state,
        primaryKeys: action.pks,
      };
    case SET_FKS:
      return {
        ...state,
        foreignKeys: action.fks,
      };
    case TOGGLE_FK:
      return {
        ...state,
        fkToggled: action.data,
      };
    case CLEAR_FK_TOGGLE:
      return {
        ...state,
        fkToggled: null,
      };
    case SET_UNIQUE_KEYS:
      return {
        ...state,
        uniqueKeys: action.data,
      };
    default:
      return state;
  }
};

export default addTableReducer;
export {
  setDefaults,
  setTableName,
  setTableComment,
  removeColumn,
  setColName,
  setColType,
  setColNullable,
  setColUnique,
  setColDefault,
  removeColDefault,
  addCol,
  setPk,
  setForeignKeys,
  setUniqueKeys,
  createTableSql,
  toggleFk,
  clearFkToggle,
};
export { resetValidation, validationError };
