#!/usr/bin/env stack
-- stack --resolver lts-8.2 --install-ghc runghc --package turtle
{-# LANGUAGE OverloadedStrings #-}
module Main where

import Prelude hiding (FilePath)
import Control.Monad.Managed
import Filesystem.Path.CurrentOS
import System.Exit
import Turtle

toText' :: FilePath -> Text
toText' = either id id . toText

findProjectRoot :: IO (Maybe FilePath)
findProjectRoot = with (findProjectRootAux 5) pure
  where
    findProjectRootAux ::
        (MonadManaged m, MonadIO m) => Int -> m (Maybe FilePath)
    findProjectRootAux n
        | n <= 0 = liftIO (putStrLn "cannot find project root, retry exhausted") >> pure Nothing
        | otherwise = do
            detected <- (&&) <$> testfile "package.json" <*> testdir ".git"
            if detected
              then Just <$> pwd
              else pushd ".." >> findProjectRootAux (n-1)

main :: IO ()
main = do
    (ExitSuccess, npmVerRaw) <- shellStrict "npm --version" ""
    let (Just npmVer) = textToLine npmVerRaw
    printf ("npm detected with version "%s%"\n") (lineToText npmVer)
    Just prjRoot <- findProjectRoot
    printf ("switching to project root: "%s%"\n") (toText' prjRoot)
    with (pushd prjRoot) $ \ () -> do
      let runScript cmdHeader cmd = do
            putStr (cmdHeader <> ": ")
            result <- shellStrict cmd ""
            case result of
                (ExitSuccess, _) -> putStrLn "ok"
                (ec, _) -> exitWith ec
      runScript "test" "npm test"
      runScript "lint" "npm run lint"
      runScript "clear-dist" "npm run clear-dist"
      runScript "transpile" "npm run transpile"
      let packageJsonContent =
            grep
              (invert (contains "\"private\": true,"))
              (input "package.json")
      output ("dist" </> "package.json") packageJsonContent
      putStrLn "package.json prepared."
      cp "README.md" ("dist" </> "README.md")
      putStrLn "static files copied."
      with (pushd "dist") $ \ () ->
        runScript "publish" "npm publish"
    pure ()
